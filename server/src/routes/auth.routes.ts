import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import * as handlers from '../handlers/auth.handlers';

export const authRoutes = Router();

// BUG 21: Rate limiting on auth endpoints to prevent brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts, please try again later' } },
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many refresh attempts, please try again later' } },
});

authRoutes.post(
  '/signup',
  authLimiter,
  validate(z.object({
    email: z.string().email('Invalid email address'),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[0-9]/, 'Password must contain a number'),
  })),
  handlers.signup
);

authRoutes.post(
  '/signin',
  authLimiter,
  validate(z.object({ email: z.string().email(), password: z.string().min(1) })),
  handlers.signin
);

authRoutes.post('/refresh', refreshLimiter, handlers.refresh);

authRoutes.post('/logout', requireAuth, handlers.logout);

// Dev-only: create test user with real tokens
if (process.env.NODE_ENV !== 'production') {
  authRoutes.post('/dev-login', handlers.devLogin);
}
