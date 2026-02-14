import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import * as handlers from '../handlers/auth.handlers';

export const authRoutes = Router();

authRoutes.post(
  '/request-code',
  validate(z.object({ phone: z.string().min(1) })),
  handlers.requestCode
);

authRoutes.post(
  '/verify-code',
  validate(z.object({ phone: z.string().min(1), code: z.string().min(1) })),
  handlers.verifyCode
);

authRoutes.post('/refresh', handlers.refresh);

authRoutes.post('/logout', requireAuth, handlers.logout);

// Dev-only: create test user with real tokens
if (process.env.NODE_ENV !== 'production') {
  authRoutes.post('/dev-login', handlers.devLogin);
}
