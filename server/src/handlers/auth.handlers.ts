import { Request, Response } from 'express';
import { adminClient } from '../lib/supabase';
import { asyncHandler } from '../utils/asyncHandler';
import { AppError } from '../utils/errors';
import { mapUser } from '../utils/caseTransform';

export const requestCode = asyncHandler(async (req: Request, res: Response) => {
  const { phone } = req.body;

  const { error } = await adminClient.auth.signInWithOtp({ phone });
  if (error) {
    throw new AppError(400, 'OTP_ERROR', error.message);
  }

  res.json({ success: true, expiresIn: 60 });
});

export const verifyCode = asyncHandler(async (req: Request, res: Response) => {
  const { phone, code } = req.body;

  const { data, error } = await adminClient.auth.verifyOtp({
    phone,
    token: code,
    type: 'sms',
  });

  if (error || !data.session) {
    throw new AppError(401, 'VERIFICATION_FAILED', error?.message ?? 'Verification failed');
  }

  const userId = data.user!.id;

  // The DB trigger handle_new_user() already creates the users + user_settings rows
  // on auth.users INSERT (with display_name='' and phone_verified=false).
  // We read first to detect new vs returning, then UPDATE to enhance the row.
  const { data: existingUser } = await adminClient
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (!existingUser) {
    throw new AppError(500, 'USER_NOT_FOUND', 'User row not created by trigger');
  }

  const isNewUser = !existingUser.phone_verified;

  const update: Record<string, unknown> = { phone_verified: true };
  if (!existingUser.display_name) {
    update.display_name = `User ${phone.slice(-4)}`;
  }

  const { data: userRow, error: updateError } = await adminClient
    .from('users')
    .update(update)
    .eq('id', userId)
    .select('*')
    .single();

  if (updateError) {
    throw new AppError(500, 'USER_UPDATE_ERROR', updateError.message);
  }

  res.json({
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: mapUser(userRow),
    isNewUser,
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing refresh token');
  }

  const refreshToken = header.slice(7);

  const { data, error } = await adminClient.auth.refreshSession({
    refresh_token: refreshToken,
  });

  if (error || !data.session) {
    throw new AppError(401, 'REFRESH_FAILED', error?.message ?? 'Token refresh failed');
  }

  res.json({
    token: data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
});

export const devLogin = asyncHandler(async (req: Request, res: Response) => {
  const devEmail = 'dev@circles.local';
  const devPassword = 'dev-password-123';
  const devPhone = '+15555550100';

  // Try signing in first (user may already exist from a previous dev-login)
  const { data: signInData } = await adminClient.auth.signInWithPassword({
    email: devEmail,
    password: devPassword,
  });

  if (signInData?.session) {
    const { data: userRow } = await adminClient
      .from('users')
      .select('*')
      .eq('id', signInData.user.id)
      .single();

    res.json({
      token: signInData.session.access_token,
      refreshToken: signInData.session.refresh_token,
      user: mapUser(userRow),
      isNewUser: false,
    });
    return;
  }

  // User doesn't exist — create via admin API (bypasses email confirmation)
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: devEmail,
    password: devPassword,
    phone: devPhone,
    email_confirm: true,
    phone_confirm: true,
  });

  if (createError || !newUser.user) {
    throw new AppError(500, 'DEV_LOGIN_ERROR', createError?.message ?? 'Failed to create dev user');
  }

  // Sign in to get a session with real tokens
  const { data: sessionData, error: sessionError } = await adminClient.auth.signInWithPassword({
    email: devEmail,
    password: devPassword,
  });

  if (sessionError || !sessionData.session) {
    throw new AppError(500, 'DEV_LOGIN_ERROR', sessionError?.message ?? 'Failed to sign in dev user');
  }

  // Fill in the user profile (trigger created a bare row)
  const { data: userRow, error: updateError } = await adminClient
    .from('users')
    .update({
      phone: devPhone,
      phone_verified: true,
      display_name: 'Dev User',
      city: 'San Francisco',
      country_code: 'US',
      languages: ['en'],
      interests: ['coding', 'testing', 'debugging'],
    })
    .eq('id', newUser.user.id)
    .select('*')
    .single();

  if (updateError) {
    throw new AppError(500, 'DEV_LOGIN_ERROR', updateError.message);
  }

  res.json({
    token: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
    user: mapUser(userRow),
    isNewUser: true,
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const header = req.headers.authorization;
  const token = header?.slice(7);

  if (token) {
    await adminClient.auth.admin.signOut(token);
  }

  res.json({ success: true });
});
