import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import * as handlers from '../handlers/activities.handlers';

export const activitiesRoutes = Router();

activitiesRoutes.use(requireAuth);

activitiesRoutes.get(
  '/',
  validate(
    z.object({
      lat: z.coerce.number(),
      lng: z.coerce.number(),
      radius: z.coerce.number().optional().default(10),
      status: z.string().optional(),
    }),
    'query'
  ),
  handlers.getNearby
);

activitiesRoutes.get('/mine', handlers.getMyActivities);

activitiesRoutes.get('/:id', handlers.getActivity);

activitiesRoutes.post(
  '/',
  validate(
    z.object({
      title: z.string().min(1).max(100),
      description: z.string().optional(),
      locationName: z.string().min(1),
      lat: z.number(),
      lng: z.number(),
      scheduledAt: z.string(),
      maxParticipants: z.number().int().min(2).optional().default(6),
    })
  ),
  handlers.createActivity
);

activitiesRoutes.put(
  '/:id',
  validate(
    z.object({
      title: z.string().max(100).optional(),
      description: z.string().optional(),
      locationName: z.string().optional(),
      scheduledAt: z.string().optional(),
      status: z.enum(['open', 'full', 'completed', 'cancelled']).optional(),
    })
  ),
  handlers.updateActivity
);

activitiesRoutes.delete('/:id', handlers.deleteActivity);

activitiesRoutes.post('/:id/join', handlers.joinActivity);
activitiesRoutes.delete('/:id/join', handlers.leaveActivity);

activitiesRoutes.put(
  '/:id/participants/:userId',
  validate(z.object({ status: z.enum(['approved', 'declined']) })),
  handlers.updateParticipant
);

activitiesRoutes.get(
  '/:id/messages',
  validate(
    z.object({
      before: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    'query'
  ),
  handlers.getMessages
);

activitiesRoutes.post(
  '/:id/messages',
  validate(z.object({ content: z.string().min(1) })),
  handlers.sendMessage
);
