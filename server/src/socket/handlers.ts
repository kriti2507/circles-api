import { adminClient } from '../lib/supabase';
import type { TypedSocket } from './types';

function roomKey(roomType: 'circle' | 'activity', roomId: string): string {
  return `${roomType}-${roomId}`;
}

async function verifyMembership(
  userId: string,
  roomType: 'circle' | 'activity',
  roomId: string
): Promise<boolean> {
  if (roomType === 'circle') {
    const { data } = await adminClient
      .from('circle_memberships')
      .select('user_id')
      .eq('circle_id', roomId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();
    return !!data;
  }

  // activity
  const { data } = await adminClient
    .from('activity_participants')
    .select('user_id')
    .eq('activity_id', roomId)
    .eq('user_id', userId)
    .eq('status', 'approved')
    .maybeSingle();
  return !!data;
}

export function registerHandlers(socket: TypedSocket): void {
  const userId = socket.data.userId;
  const displayName = socket.data.displayName;

  console.log(`Socket connected: ${userId} (${displayName})`);

  // --- chat:join ---
  socket.on('chat:join', async ({ room_type, room_id }) => {
    try {
      const isMember = await verifyMembership(userId, room_type, room_id);
      if (!isMember) {
        socket.emit('error', { message: 'Not a member of this room' });
        return;
      }

      const room = roomKey(room_type, room_id);
      socket.join(room);
      console.log(`${userId} joined ${room}`);
    } catch (err) {
      console.error('chat:join error', err);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // --- chat:leave ---
  socket.on('chat:leave', ({ room_type, room_id }) => {
    const room = roomKey(room_type, room_id);
    socket.leave(room);
    console.log(`${userId} left ${room}`);
  });

  // --- chat:typing ---
  socket.on('chat:typing', ({ room_type, room_id, is_typing }) => {
    const room = roomKey(room_type, room_id);
    socket.to(room).emit('chat:typing', {
      room_id,
      userId,
      displayName,
      isTyping: is_typing,
    });
  });

  // --- disconnect ---
  socket.on('disconnect', (reason) => {
    // Broadcast typing=false to all rooms this socket was in
    for (const room of socket.rooms) {
      if (room === socket.id) continue; // skip the default self-room
      socket.to(room).emit('chat:typing', {
        room_id: room,
        userId,
        displayName,
        isTyping: false,
      });
    }
    console.log(`Socket disconnected: ${userId} (${reason})`);
  });
}
