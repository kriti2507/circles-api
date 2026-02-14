import type { Server, Socket } from 'socket.io';

// --- Client-to-Server Events ---

interface JoinLeavePayload {
  room_type: 'circle' | 'activity';
  room_id: string;
}

interface TypingPayload {
  room_type: 'circle' | 'activity';
  room_id: string;
  is_typing: boolean;
}

export interface ClientToServerEvents {
  'chat:join': (payload: JoinLeavePayload) => void;
  'chat:leave': (payload: JoinLeavePayload) => void;
  'chat:typing': (payload: TypingPayload) => void;
}

// --- Server-to-Client Events ---

export interface ServerToClientEvents {
  'chat:message': (data: { message: ReturnType<typeof import('../utils/caseTransform').mapMessage> }) => void;
  'chat:typing': (data: {
    room_id: string;
    userId: string;
    displayName: string;
    isTyping: boolean;
  }) => void;
  'circle:prompt': (data: { prompt: unknown }) => void;
  'circle:member_joined': (data: { room_id: string; user: { id: string; displayName: string; avatarUrl?: string } }) => void;
  'circle:member_left': (data: { user_id: string; display_name: string }) => void;
  'activity:participant_update': (data: { activity_id: string; user: { id: string; displayName: string; avatarUrl?: string }; status: string }) => void;
  'activity:status_change': (data: { activity_id: string; status: string }) => void;
  error: (data: { message: string }) => void;
}

// --- Socket Data (attached after auth) ---

export interface SocketData {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

// --- Typed aliases ---

export type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
