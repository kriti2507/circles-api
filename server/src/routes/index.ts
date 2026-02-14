import { Router } from 'express';
import { authRoutes } from './auth.routes';
import { usersRoutes } from './users.routes';
import { circlesRoutes } from './circles.routes';
import { activitiesRoutes } from './activities.routes';
import { notificationsRoutes } from './notifications.routes';

export const routes = Router();

routes.use('/auth', authRoutes);
routes.use('/users', usersRoutes);
routes.use('/circles', circlesRoutes);
routes.use('/activities', activitiesRoutes);
routes.use('/', notificationsRoutes);
