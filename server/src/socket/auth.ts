import { adminClient } from '../lib/supabase';
import type { TypedSocket } from './types';

export async function socketAuth(
  socket: TypedSocket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const token = socket.handshake.auth.token as string | undefined;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const { data, error } = await adminClient.auth.getUser(token);
    if (error || !data.user) {
      return next(new Error('Invalid or expired token'));
    }

    const { data: user } = await adminClient
      .from('users')
      .select('display_name, avatar_url')
      .eq('id', data.user.id)
      .single();

    socket.data.userId = data.user.id;
    socket.data.displayName = user?.display_name ?? 'Unknown';
    socket.data.avatarUrl = user?.avatar_url ?? undefined;

    next();
  } catch {
    next(new Error('Authentication failed'));
  }
}
