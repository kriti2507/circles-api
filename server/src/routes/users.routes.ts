import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import * as handlers from '../handlers/users.handlers';

export const usersRoutes = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

usersRoutes.use(requireAuth);

usersRoutes.get('/me', handlers.getMe);

usersRoutes.put(
  '/me',
  validate(
    z.object({
      displayName: z.string().max(50).optional(),
      bio: z.string().max(160).optional(),
      city: z.string().max(100).optional(),
      countryCode: z.string().max(3).optional(),
      location: z
        .object({ latitude: z.number(), longitude: z.number() })
        .optional(),
      languages: z.array(z.string()).optional(),
      interests: z.array(z.string()).optional(),
    })
  ),
  handlers.updateMe
);

usersRoutes.put('/me/avatar', upload.single('image'), handlers.updateAvatar);

usersRoutes.get('/me/settings', handlers.getSettings);

usersRoutes.put(
  '/me/settings',
  validate(
    z.object({
      language: z.string().optional(),
      notificationsEnabled: z.boolean().optional(),
      notificationsMessages: z.boolean().optional(),
      notificationsPrompts: z.boolean().optional(),
      notificationsActivities: z.boolean().optional(),
      distanceUnit: z.enum(['km', 'miles']).optional(),
    })
  ),
  handlers.updateSettings
);

usersRoutes.delete('/me', handlers.deleteMe);

usersRoutes.post('/:id/block', handlers.blockUser);
usersRoutes.delete('/:id/block', handlers.unblockUser);

usersRoutes.post(
  '/:id/report',
  validate(
    z.object({
      reason: z.enum(['harassment', 'spam', 'inappropriate', 'no_show', 'other']),
      details: z.string().optional(),
    })
  ),
  handlers.reportUser
);
