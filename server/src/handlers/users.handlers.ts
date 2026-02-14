import { Request, Response } from 'express';
import { adminClient } from '../lib/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError, Errors } from '../utils/errors';
import {
  mapUser,
  mapUserSettings,
  mapCircleMember,
} from '../utils/caseTransform';

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  // Fetch user
  const { data: user, error: userError } = await adminClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (userError || !user) throw Errors.notFound('User');

  // Fetch settings
  const { data: settings } = await adminClient
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  // Fetch active circle membership
  const { data: membership } = await adminClient
    .from('circle_memberships')
    .select('circle_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  let circle = null;

  if (membership) {
    const { data: circleData } = await adminClient
      .from('circles')
      .select('*, prompts(*)')
      .eq('id', membership.circle_id)
      .single();

    if (circleData) {
      const { data: members } = await adminClient
        .from('circle_memberships')
        .select('user_id, status, joined_at, users(display_name, avatar_url)')
        .eq('circle_id', membership.circle_id)
        .eq('status', 'active');

      circle = {
        id: circleData.id,
        name: circleData.name,
        status: circleData.status,
        currentPromptId: circleData.current_prompt_id ?? undefined,
        promptDeliveredAt: circleData.prompt_delivered_at ?? undefined,
        createdAt: circleData.created_at,
        updatedAt: circleData.updated_at,
        members: (members || []).map(mapCircleMember),
        prompt: circleData.prompts
          ? {
              id: circleData.prompts.id,
              textEn: circleData.prompts.text_en,
              textJa: circleData.prompts.text_ja ?? undefined,
              textZh: circleData.prompts.text_zh ?? undefined,
              category: circleData.prompts.category,
              isActive: circleData.prompts.is_active,
              createdAt: circleData.prompts.created_at,
            }
          : null,
      };
    }
  }

  res.json({
    user: mapUser(user),
    settings: settings ? mapUserSettings(settings) : null,
    circle,
  });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const body = req.body;

  const update: Record<string, unknown> = {};
  if (body.displayName !== undefined) update.display_name = body.displayName;
  if (body.bio !== undefined) update.bio = body.bio;
  if (body.city !== undefined) update.city = body.city;
  if (body.countryCode !== undefined) update.country_code = body.countryCode;
  if (body.languages !== undefined) update.languages = body.languages;
  if (body.interests !== undefined) update.interests = body.interests;
  if (body.location !== undefined) {
    update.location = `POINT(${body.location.longitude} ${body.location.latitude})`;
  }
  update.updated_at = new Date().toISOString();

  const { data: user, error } = await adminClient
    .from('users')
    .update(update)
    .eq('id', userId)
    .select('*')
    .single();

  if (error) throw new AppError(500, 'UPDATE_ERROR', error.message);

  res.json({ user: mapUser(user) });
});

export const updateAvatar = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const file = req.file;

  if (!file) {
    throw new AppError(400, 'NO_FILE', 'No image file provided');
  }

  const filePath = `avatars/${userId}/${Date.now()}.${file.originalname.split('.').pop()}`;

  const { error: uploadError } = await adminClient.storage
    .from('avatars')
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (uploadError) {
    throw new AppError(500, 'UPLOAD_ERROR', uploadError.message);
  }

  const { data: urlData } = adminClient.storage.from('avatars').getPublicUrl(filePath);
  const avatarUrl = urlData.publicUrl;

  await adminClient
    .from('users')
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq('id', userId);

  res.json({ avatarUrl });
});

export const getSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  const { data: settings, error } = await adminClient
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !settings) throw Errors.notFound('Settings');

  res.json({ settings: mapUserSettings(settings) });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const body = req.body;

  const update: Record<string, unknown> = {};
  if (body.language !== undefined) update.language = body.language;
  if (body.notificationsEnabled !== undefined) update.notifications_enabled = body.notificationsEnabled;
  if (body.notificationsMessages !== undefined) update.notifications_messages = body.notificationsMessages;
  if (body.notificationsPrompts !== undefined) update.notifications_prompts = body.notificationsPrompts;
  if (body.notificationsActivities !== undefined) update.notifications_activities = body.notificationsActivities;
  if (body.distanceUnit !== undefined) update.distance_unit = body.distanceUnit;
  update.updated_at = new Date().toISOString();

  const { data: settings, error } = await adminClient
    .from('user_settings')
    .update(update)
    .eq('user_id', userId)
    .select('*')
    .single();

  if (error) throw new AppError(500, 'UPDATE_ERROR', error.message);

  res.json({ settings: mapUserSettings(settings) });
});

export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;

  // Soft-delete: set status to 'deleted'
  await adminClient
    .from('users')
    .update({ status: 'deleted', updated_at: new Date().toISOString() })
    .eq('id', userId);

  // Clean up queue entry
  await adminClient.from('matching_queue').delete().eq('user_id', userId);

  // Clean up push tokens
  await adminClient.from('push_tokens').delete().eq('user_id', userId);

  res.json({ success: true });
});

export const blockUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const blockedId = req.params.id;

  const { error } = await adminClient
    .from('user_blocks')
    .insert({ blocker_id: userId, blocked_id: blockedId });

  if (error) {
    if (error.code === '23505') {
      throw new AppError(409, 'ALREADY_BLOCKED', 'User is already blocked');
    }
    throw new AppError(500, 'BLOCK_ERROR', error.message);
  }

  res.json({ success: true });
});

export const unblockUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const blockedId = req.params.id;

  await adminClient
    .from('user_blocks')
    .delete()
    .eq('blocker_id', userId)
    .eq('blocked_id', blockedId);

  res.json({ success: true });
});

export const reportUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const reportedUserId = req.params.id;
  const { reason, details } = req.body;

  const { error } = await adminClient.from('reports').insert({
    reporter_id: userId,
    reported_user_id: reportedUserId,
    reason,
    details: details ?? null,
  });

  if (error) throw new AppError(500, 'REPORT_ERROR', error.message);

  res.json({ success: true });
});
