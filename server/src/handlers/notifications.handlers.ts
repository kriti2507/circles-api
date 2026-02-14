import { Request, Response } from 'express';
import { adminClient } from '../lib/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';

export const registerToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { token, platform } = req.body;

  const { error } = await adminClient.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform,
      is_active: true,
    },
    { onConflict: 'user_id,token' }
  );

  if (error) throw new AppError(500, 'TOKEN_ERROR', error.message);

  res.json({ success: true });
});

export const unregisterToken = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.userId!;
  const { token } = req.body;

  await adminClient
    .from('push_tokens')
    .delete()
    .eq('user_id', userId)
    .eq('token', token);

  res.json({ success: true });
});
