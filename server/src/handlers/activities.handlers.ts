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

  // Enrich with host info and participant counts
  const enriched = await Promise.all(
    activities.map(async (a: { id: string; host_id: string }) => {
      const { data: host } = await adminClient
        .from('users')
        .select('id, display_name, avatar_url')
        .eq('id', a.host_id)
        .single();

      const { count } = await adminClient
        .from('activity_participants')
        .select('*', { count: 'exact', head: true })
        .eq('activity_id', a.id)
        .eq('status', 'approved');

      return { ...a, users: host, current_participants: count ?? 0 };
    })
  );

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
  await adminClient.from('activity_participants').insert({
    activity_id: inserted.id,
    user_id: userId,
    status: 'approved',
    responded_at: new Date().toISOString(),
  });

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

  await adminClient.from('activities').delete().eq('id', activityId);

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

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const activityId = req.params.id;
  const { before, limit } = req.query as unknown as { before?: string; limit: number };

  // Verify participant
  const { data: participant } = await adminClient
    .from('activity_participants')
    .select('status')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!participant || participant.status !== 'approved') {
    throw Errors.forbidden('Only approved participants can view messages');
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

  // Verify approved participant
  const { data: participant } = await adminClient
    .from('activity_participants')
    .select('status')
    .eq('activity_id', activityId)
    .eq('user_id', userId)
    .maybeSingle();

  if (!participant || participant.status !== 'approved') {
    throw Errors.forbidden('Only approved participants can send messages');
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
