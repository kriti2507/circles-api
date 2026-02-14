import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import * as handlers from '../handlers/circles.handlers';

export const circlesRoutes = Router();

circlesRoutes.use(requireAuth);

circlesRoutes.get('/mine', handlers.getMyCircle);
circlesRoutes.post('/join-queue', handlers.joinQueue);
circlesRoutes.delete('/leave-queue', handlers.leaveQueue);
circlesRoutes.post('/mine/leave', handlers.leaveCircle);

circlesRoutes.get(
  '/mine/messages',
  validate(
    z.object({
      before: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    'query'
  ),
  handlers.getMessages
);

circlesRoutes.post(
  '/mine/messages',
  validate(z.object({ content: z.string().min(1) })),
  handlers.sendMessage
);
