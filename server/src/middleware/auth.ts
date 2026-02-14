import { Request, Response, NextFunction } from 'express';
import { adminClient } from '../lib/supabase';
import { AppError } from '../utils/errors';

export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid authorization header');
    }

    const token = header.slice(7);

    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired token');
    }

    req.userId = data.user.id;
    next();
  } catch (err) {
    next(err);
  }
};
