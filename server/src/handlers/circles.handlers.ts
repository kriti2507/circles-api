import { Request, Response } from 'express';
import { adminClient } from '../lib/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, Errors } from '../utils/errors';
import { mapCircleMember, mapMessage } from '../utils/caseTransform';
import { getIO } from '../socket';

async function getActiveCircleId(userId: string): Promise<string | null> {
  const { data } = await adminClient
    .from('circle_memberships')
    .select('circle_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  return data?.circle_id ?? null;
}

export const getMyCircle = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  const circleId = await getActiveCircleId(userId);
  if (!circleId) {
    res.json(null);
    return;
  }

  const { data: circle } = await adminClient
    .from('circles')
    .select('*, prompts(*)')
    .eq('id', circleId)
    .single();

  if (!circle) {
    res.json(null);
    return;
  }

  const { data: members } = await adminClient
    .from('circle_memberships')
    .select('user_id, status, joined_at, users(display_name, avatar_url)')
    .eq('circle_id', circleId)
    .eq('status', 'active');

  res.json({
    circle: {
      id: circle.id,
      name: circle.name,
      status: circle.status,
      currentPromptId: circle.current_prompt_id ?? undefined,
      promptDeliveredAt: circle.prompt_delivered_at ?? undefined,
      createdAt: circle.created_at,
      updatedAt: circle.updated_at,
    },
    members: (members || []).map(mapCircleMember),
    prompt: circle.prompts
      ? {
          id: circle.prompts.id,
          textEn: circle.prompts.text_en,
          textJa: circle.prompts.text_ja ?? undefined,
          textZh: circle.prompts.text_zh ?? undefined,
          category: circle.prompts.category,
          isActive: circle.prompts.is_active,
          createdAt: circle.prompts.created_at,
        }
      : null,
  });
});

export const joinQueue = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  // Check if already in a circle
  const circleId = await getActiveCircleId(userId);
  if (circleId) {
    throw new AppError(409, 'ALREADY_IN_CIRCLE', 'You are already in an active circle');
  }

  // Check if already in queue
  const { data: existing } = await adminClient
    .from('matching_queue')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    throw new AppError(409, 'ALREADY_IN_QUEUE', 'You are already in the matching queue');
  }

  // Insert into queue
  const { error } = await adminClient
    .from('matching_queue')
    .insert({ user_id: userId });

  if (error) throw new AppError(500, 'QUEUE_ERROR', error.message);

  // Trigger match-users edge function
  try {
    await adminClient.functions.invoke('match-users', {
      body: { mode: 'event', user_id: userId },
    });
  } catch {
    // Non-fatal: matching will happen in batch sweep
  }

  // Get queue position
  const { count } = await adminClient
    .from('matching_queue')
    .select('*', { count: 'exact', head: true });

  res.json({
    position: count ?? 1,
    estimatedWait: 'Checking for compatible matches...',
  });
});

export const leaveQueue = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  await adminClient.from('matching_queue').delete().eq('user_id', userId);

  res.json({ success: true });
});

export const leaveCircle = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  const circleId = await getActiveCircleId(userId);
  if (!circleId) {
    throw Errors.notFound('Active circle');
  }

  // Update membership status
  await adminClient
    .from('circle_memberships')
    .update({ status: 'left', left_at: new Date().toISOString() })
    .eq('circle_id', circleId)
    .eq('user_id', userId);

  // Get user name for system message
  const { data: user } = await adminClient
    .from('users')
    .select('display_name')
    .eq('id', userId)
    .single();

  // Insert system message
  await adminClient.from('messages').insert({
    circle_id: circleId,
    sender_id: userId,
    content: `${user?.display_name ?? 'A member'} left the circle`,
    message_type: 'system',
  });

  // Broadcast to circle room
  try {
    getIO().to(`circle-${circleId}`).emit('circle:member_left', {
      user_id: userId,
      display_name: user?.display_name ?? 'A member',
    });
  } catch { /* broadcast failure is non-fatal */ }

  res.json({ success: true });
});

export const getMessages = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { before, limit } = req.query as unknown as { before?: string; limit: number };

  const circleId = await getActiveCircleId(userId);
  if (!circleId) {
    throw Errors.notFound('Active circle');
  }

  let query = adminClient
    .from('messages')
    .select('*, users(display_name, avatar_url)')
    .eq('circle_id', circleId)
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
  const { content } = req.body;

  const circleId = await getActiveCircleId(userId);
  if (!circleId) {
    throw Errors.notFound('Active circle');
  }

  const { data: message, error } = await adminClient
    .from('messages')
    .insert({
      circle_id: circleId,
      sender_id: userId,
      content,
      message_type: 'text',
    })
    .select('*, users(display_name, avatar_url)')
    .single();

  if (error) throw new AppError(500, 'SEND_ERROR', error.message);

  const mapped = mapMessage(message);

  // Broadcast to circle room
  try {
    getIO().to(`circle-${circleId}`).emit('chat:message', { message: mapped });
  } catch { /* broadcast failure is non-fatal */ }

  res.status(201).json({ message: mapped });
});
