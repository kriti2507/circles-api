import express from 'express';
import cors from 'cors';
import { routes } from './routes';
import { errorHandler } from './middleware/errorHandler';

// BUG 20: Configure CORS based on environment
function getCorsOrigin(): string | string[] | boolean {
  if (process.env.NODE_ENV === 'production') {
    return [
      'https://circles.app',
      'https://www.circles.app',
    ];
  }
  // Development / staging: allow localhost ports and mobile
  return true;
}

export function createApp() {
  const app = express();

  app.use(cors({ origin: getCorsOrigin() }));
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1', routes);

  app.use(errorHandler);

  return app;
}
