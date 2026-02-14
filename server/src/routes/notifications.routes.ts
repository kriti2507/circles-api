import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import * as handlers from '../handlers/notifications.handlers';

export const notificationsRoutes = Router();

notificationsRoutes.use(requireAuth);

notificationsRoutes.post(
  '/push-tokens',
  validate(
    z.object({
      token: z.string().min(1),
      platform: z.enum(['ios', 'android']),
    })
  ),
  handlers.registerToken
);

notificationsRoutes.delete(
  '/push-tokens',
  validate(z.object({ token: z.string().min(1) })),
  handlers.unregisterToken
);
