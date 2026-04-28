import { Request, Response } from 'express';
import { adminClient } from '../lib/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, Errors } from '../utils/errors';
import { mapActivity, mapParticipant, mapMessage } from '../utils/caseTransform';
import { getIO } from '../socket';

const ACTIVITY_SELECT = '*, users!activities_host_id_fkey(id, display_name, avatar_url)';

async function fetchActivityWithCount(activityId: string) {
  const { data: activity, error } = await adminClient
    .from('activities')
    .select(ACTIVITY_SELECT)
    .eq('id', activityId)
    .single();

  if (error || !activity) return null;

  const { count } = await adminClient
    .from('activity_participants')
    .select('*', { count: 'exact', head: true })
    .eq('activity_id', activityId)
    .eq('status', 'approved');

  return { ...activity, current_participants: count ?? 0 };
}

/**
 * BUG 14: Batch-fetch hosts and participant counts to eliminate N+1 queries.
 * Reduces 2N+1 queries to 3 total.
 */
export const getNearby = asyncHandler(async (req: Request, res: Response) => {
  const { lat, lng, radius, status } = req.query as unknown as {
    lat: number;
    lng: number;
    radius: number;
    status?: string;
  };

  const { data, error } = await adminClient.rpc('get_nearby_activities', {
    user_lat: lat,
    user_lng: lng,
    radius_km: radius,
  });

  if (error) throw new AppError(500, 'FETCH_ERROR', error.message);

  let activities = data || [];
  if (status) {
    activities = activities.filter((a: { status: string }) => a.status === status);
  }

  if (activities.length === 0) {
    res.json({ activities: [] });
    return;
  }

  // Batch: collect all host IDs and activity IDs
  const hostIds = [...new Set(activities.map((a: { host_id: string }) => a.host_id))];
  const activityIds = activities.map((a: { id: string }) => a.id);

  // Single query for all hosts
  const { data: hosts } = await adminClient
    .from('users')
    .select('id, display_name, avatar_url')
    .in('id', hostIds);

  const hostMap = new Map((hosts || []).map((h: any) => [h.id, h]));

  // Single query for all approved participant counts
  const { data: participantRows } = await adminClient
    .from('activity_participants')
    .select('activity_id')
    .in('activity_id', activityIds)
    .eq('status', 'approved');

  // Count participants per activity in JS
  const countMap = new Map<string, number>();
  for (const row of participantRows || []) {
    countMap.set(row.activity_id, (countMap.get(row.activity_id) ?? 0) + 1);
  }

  const enriched = activities.map((a: { id: string; host_id: string }) => ({
    ...a,
    users: hostMap.get(a.host_id) ?? null,
    current_participants: countMap.get(a.id) ?? 0,
  }));

  res.json({ activities: enriched.map(mapActivity) });
});

export const getMyActivities = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const type = (req.query.type as string) || 'hosting';

  let activityIds: string[] = [];

  if (type === 'hosting') {
    const { data } = await adminClient
      .from('activities')
      .select('id')
      .eq('host_id', userId);
    activityIds = (data || []).map((a) => a.id);
  } else {
    const { data } = await adminClient
      .from('activity_participants')
      .select('activity_id')
      .eq('user_id', userId);
    activityIds = (data || []).map((p) => p.activity_id);
  }

  if (activityIds.length === 0) {
    res.json({ activities: [] });
    return;
  }

  const { data: activities } = await adminClient
    .from('activities')
    .select(ACTIVITY_SELECT)
    .in('id', activityIds)
    .order('scheduled_at', { ascending: true });

  const enriched = await Promise.all(
    (activities || []).map(async (a) => {
      const { count } = await adminClient
        .from('activity_participants')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', a.id)
        .eq('status', 'approved');
      return { ...a, current_participants: count ?? 0 };
    })
  );

  res.json({ activities: enriched.map(mapActivity) });
});

export const getActivity = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const activityId = req.params.id;

  const activity = await fetchActivityWithCount(activityId);
  if (!activity) throw Errors.notFound('Activity');

  const { data: participants } = await adminClient
    .from('activity_participants')
    .select('*, users(id, display_name, avatar_url)')
    .eq('activity_id', activityId);

  const isParticipating = (participants || []).some(
    (p: { user_id: string; status: string }) =>
      p.user_id === userId && (p.status === 'pending' || p.status === 'approved')
  );

  res.json({
    activity: mapActivity(activity),
    participants: (participants || []).map(mapParticipant),
    isParticipating,
  });
});

export const createActivity = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { title, description, locationName, lat, lng, scheduledAt, maxParticipants } = req.body;

  // Insert activity — use SRID-prefixed EWKT for reliable geography casting
  const { data: inserted, error: insertError } = await adminClient
    .from('activities')
    .insert({
      host_id: userId,
      title,
      description: description ?? null,
      location_name: locationName,
      location: `SRID=4326;POINT(${lng} ${lat})`,
      scheduled_at: scheduledAt,
      max_participants: maxParticipants,
    })
    .select('id')
    .single();

  if (insertError) throw new AppError(500, 'CREATE_ERROR', insertError.message);

  // Auto-add host as approved participant
  const { error: participantError } = await adminClient.from('activity_participants').insert({
    activity_id: inserted.id,
    user_id: userId,
    status: 'approved',
    responded_at: new Date().toISOString(),
  });

  if (participantError) {
    console.error('Failed to add host as participant:', participantError.message);
  }

  // Fetch the full activity with host info
  const activity = await fetchActivityWithCount(inserted.id);
  if (!activity) throw new AppError(500, 'CREATE_ERROR', 'Failed to fetch created activity');

  res.status(201).json({
    activity: mapActivity({ ...activity, current_participants: 1 }),
  });
});

export const updateActivity = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const activityId = req.params.id;

  // Verify host
  const { data: existing } = await adminClient
    .from('activities')
    .select('host_id')
    .eq('id', activityId)
    .single();

  if (!existing) throw Errors.notFound('Activity');
  if (existing.host_id !== userId) throw Errors.forbidden('Only the host can update this activity');

  const body = req.body;
  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description;
  if (body.locationName !== undefined) update.location_name = body.locationName;
  if (body.scheduledAt !== undefined) update.scheduled_at = body.scheduledAt;
  if (body.status !== undefined) update.status = body.status;
  update.updated_at = new Date().toISOString();

  const { data: activity, error } = await adminClient
    .from('activities')
    .update(update)
    .eq('id', activityId)
    .select(ACTIVITY_SELECT)
    .single();

  if (error) throw new AppError(500, 'UPDATE_ERROR', error.message);

  const enriched = await fetchActivityWithCount(activityId);

  // Broadcast status change if status was updated
  if (body.status !== undefined) {
    try {
      getIO().to(`activity-${activityId}`).emit('activity:status_change', {
        activity_id: activityId,
        status: body.status,
      });
    } catch { /* broadcast failure is non-fatal */ }
  }

  res.json({ activity: mapActivity(enriched!) });
});

/**
 * BUG 23: Delete related rows (messages, participants) before deleting the activity.
 * Also broadcast deletion to connected clients.
 */
export const deleteActivity = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const activityId = req.params.id;

  const { data: existing } = await adminClient
    .from('activities')
    .select('host_id')
    .eq('id', activityId)
    .single();

  if (!existing) throw Errors.notFound('Activity');
  if (existing.host_id !== userId) throw Errors.forbidden('Only the host can delete this activity');

  // Clean up related rows before deleting the activity
  await adminClient.from('messages').delete().eq('activity_id', activityId);
  await adminClient.from('activity_participants').delete().eq('activity_id', activityId);
  await adminClient.from('activities').delete().eq('id', activityId);

  // Notify connected clients
  try {
    getIO().to(`activity-${activityId}`).emit('activity:status_change', {
      activity_id: activityId,
      status: 'deleted',
    });
  } catch { /* broadcast failure is non-fatal */ }

  res.json({ success: true });
});

export const joinActivity = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const activityId = req.params.id;

  const { data: activity } = await adminClient
    .from('activities')
    .select('id, status')
    .eq('id', activityId)
    .single();

  if (!activity) throw Errors.notFound('Activity');

  const { error } = await adminClient.from('activity_participants').insert({
    activity_id: activityId,
    user_id: userId,
    status: 'pending',
  });

  if (error) {
    if (error.code === '23505') {
      throw new AppError(409, 'ALREADY_JOINED', 'You have already requested to join');
    }
    throw new AppError(500, 'JOIN_ERROR', error.message);
  }

  // Fetch user info for broadcast
  const { data: joinUser } = await adminClient
    .from('users')
    .select('id, display_name, avatar_url')
    .eq('id', userId)
    .single();

  try {
    getIO().to(`activity-${activityId}`).emit('activity:participant_update', {
      activity_id: activityId,
      user: {
        id: userId,
        displayName: joinUser?.display_name ?? 'Unknown',
        avatarUrl: joinUser?.avatar_url ?? undefined,
      },
      status: 'pending',
    });
  } catch { /* broadcast failure is non-fatal */ }

  res.json({ status: 'pending' });
});

export const leaveActivity = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const activityId = req.params.id;

  // Fetch user info before deleting
  const { data: leaveUser } = await adminClient
    .from('users')
    .select('id, display_name, avatar_url')
    .eq('id', userId)
    .single();

  await adminClient
    .from('activity_participants')
    .delete()
    .eq('activity_id', activityId)
    .eq('user_id', userId);

  try {
    getIO().to(`activity-${activityId}`).emit('activity:participant_update', {
      activity_id: activityId,
      user: {
        id: userId,
        displayName: leaveUser?.display_name ?? 'Unknown',
        avatarUrl: leaveUser?.avatar_url ?? undefined,
      },
      status: 'cancelled',
    });
  } catch { /* broadcast failure is non-fatal */ }

  res.json({ success: true });
});

export const updateParticipant = asyncHandler(async (req: Request, res: Response) => {
  const currentUserId = req.userId!;
  const activityId = req.params.id;
  const targetUserId = req.params.userId;
  const { status } = req.body;

  // Verify host
  const { data: activity } = await adminClient
    .from('activities')
    .select('host_id')
    .eq('id', activityId)
    .single();

  if (!activity) throw Errors.notFound('Activity');
  if (activity.host_id !== currentUserId) {
    throw Errors.forbidden('Only the host can manage participants');
  }

  const { error } = await adminClient
    .from('activity_participants')
    .update({ status, responded_at: new Date().toISOString() })
    .eq('activity_id', activityId)
    .eq('user_id', targetUserId);

  if (error) throw new AppError(500, 'UPDATE_ERROR', error.message);

  // Fetch target user info for broadcast
  const { data: targetUser } = await adminClient
    .from('users')
    .select('id, display_name, avatar_url')
    .eq('id', targetUserId)
    .single();

  try {
    getIO().to(`activity-${activityId}`).emit('activity:participant_update', {
      activity_id: activityId,
      user: {
        id: targetUserId,
        displayName: targetUser?.display_name ?? 'Unknown',
        avatarUrl: targetUser?.avatar_url ?? undefined,
      },
      status,
    });
  } catch { /* broadcast failure is non-fatal */ }

  res.json({ success: true });
});

/**
 * BUG 28: If participant check fails but user is the host, self-heal by upserting
 * the missing participant row so the host can always access their own chat.
 */
export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const activityId = req.params.id;
  const { before, limit } = req.query as unknown as { before?: string; limit: number };

  // Verify participant or host
  const { data: participant } = await adminClient
    .from('activity_participants')
    .select('status')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!participant || participant.status !== 'approved') {
    // Check if user is the host
    const { data: activity } = await adminClient
      .from('activities')
      .select('host_id')
      .eq('id', activityId)
      .single();

    if (!activity || activity.host_id !== userId) {
      throw Errors.forbidden('Only approved participants can view messages');
    }

    // Self-heal: upsert the missing participant row for the host
    await adminClient.from('activity_participants').upsert(
      {
        activity_id: activityId,
        user_id: userId,
        status: 'approved',
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'activity_id,user_id' }
    );
  }

  let query = adminClient
    .from('messages')
    .select('*, users(display_name, avatar_url)')
    .eq('activity_id', activityId)
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (before) {
    query = query.lt('created_at', before);
  }

  const { data: messages, error } = await query;
  if (error) throw new AppError(500, 'FETCH_ERROR', error.message);

  const hasMore = (messages?.length ?? 0) > limit;
  const result = (messages || []).slice(0, limit);

  res.json({
    messages: result.map(mapMessage),
    hasMore,
  });
});

export const sendMessage = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const activityId = req.params.id;
  const { content } = req.body;

  // Verify approved participant or host
  const { data: participant } = await adminClient
    .from('activity_participants')
    .select('status')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!participant || participant.status !== 'approved') {
    // Check if user is the host
    const { data: activity } = await adminClient
      .from('activities')
      .select('host_id')
      .eq('id', activityId)
      .single();

    if (!activity || activity.host_id !== userId) {
      throw Errors.forbidden('Only approved participants can send messages');
    }

    // Self-heal: upsert the missing participant row for the host
    await adminClient.from('activity_participants').upsert(
      {
        activity_id: activityId,
        user_id: userId,
        status: 'approved',
        responded_at: new Date().toISOString(),
      },
      { onConflict: 'activity_id,user_id' }
    );
  }

  const { data: message, error } = await adminClient
    .from('messages')
    .insert({
      activity_id: activityId,
      sender_id: userId,
      content,
      message_type: 'text',
    })
    .select('*, users(display_name, avatar_url)')
    .single();

  if (error) throw new AppError(500, 'SEND_ERROR', error.message);

  const mapped = mapMessage(message);

  // Broadcast to activity room
  try {
    getIO().to(`activity-${activityId}`).emit('chat:message', { message: mapped });
  } catch { /* broadcast failure is non-fatal */ }

  res.status(201).json({ message: mapped });
});
