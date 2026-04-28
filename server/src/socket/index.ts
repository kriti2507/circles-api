import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import type { TypedServer } from './types';
import { socketAuth } from './auth';
import { registerHandlers } from './handlers';

let io: TypedServer | null = null;

// BUG 20: Configure socket CORS based on environment
function getSocketCorsOrigin(): string | string[] | boolean {
  if (process.env.NODE_ENV === 'production') {
    return [
      'https://circles.app',
      'https://www.circles.app',
    ];
  }
  return true;
}

export function initSocket(httpServer: HttpServer): TypedServer {
  io = new Server(httpServer, {
    cors: { origin: getSocketCorsOrigin() },
    transports: ['websocket'],
  }) as TypedServer;

  io.use(socketAuth);

  io.on('connection', (socket) => {
    registerHandlers(socket);
  });

  console.log('Socket.io initialized');
  return io;
}

export function getIO(): TypedServer {
  if (!io) {
    throw new Error('Socket.io not initialized — call initSocket() first');
  }
  return io;
}
