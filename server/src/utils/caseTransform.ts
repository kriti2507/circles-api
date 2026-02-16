// --- Domain-specific mappers ---

interface DbUser {
  id: string;
  phone?: string | null;
  phone_verified?: boolean;
  email?: string | null;
  email_verified?: boolean;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  city?: string | null;
  country_code?: string | null;
  location?: { type: string; coordinates: [number, number] } | null;
  languages: string[];
  interests: string[];
  status: string;
  last_active_at?: string | null;
  created_at: string;
  updated_at: string;
}

export function mapUser(row: DbUser) {
  return {
    id: row.id,
    email: row.email ?? '',
    emailVerified: row.email_verified ?? false,
    phone: row.phone ?? undefined,
    phoneVerified: row.phone_verified ?? false,
    displayName: row.display_name,
    bio: row.bio ?? undefined,
    avatarUrl: row.avatar_url ?? undefined,
    city: row.city ?? undefined,
    countryCode: row.country_code ?? undefined,
    location: row.location
      ? { latitude: row.location.coordinates[1], longitude: row.location.coordinates[0] }
      : undefined,
    languages: row.languages ?? [],
    interests: row.interests ?? [],
    status: row.status,
    lastActiveAt: row.last_active_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapUserSettings(row: {
  user_id: string;
  language: string;
  notifications_enabled: boolean;
  notifications_messages: boolean;
  notifications_prompts: boolean;
  notifications_activities: boolean;
  distance_unit: string;
  updated_at: string;
}) {
  return {
    userId: row.user_id,
    language: row.language,
    notificationsEnabled: row.notifications_enabled,
    notificationsMessages: row.notifications_messages,
    notificationsPrompts: row.notifications_prompts,
    notificationsActivities: row.notifications_activities,
    distanceUnit: row.distance_unit,
    updatedAt: row.updated_at,
  };
}

export function mapMessage(row: any) {
  const user = Array.isArray(row.users) ? row.users[0] : row.users;
  return {
    id: row.id,
    circleId: row.circle_id ?? undefined,
    activityId: row.activity_id ?? undefined,
    senderId: row.sender_id,
    senderName: user?.display_name ?? 'Unknown',
    senderAvatar: user?.avatar_url ?? undefined,
    content: row.content,
    messageType: row.message_type,
    createdAt: row.created_at,
  };
}

export function mapCircleMember(row: any) {
  const user = Array.isArray(row.users) ? row.users[0] : row.users;
  return {
    id: row.user_id,
    displayName: user?.display_name ?? 'Unknown',
    avatarUrl: user?.avatar_url ?? undefined,
    status: row.status,
    joinedAt: row.joined_at,
  };
}

export function mapActivity(row: any) {
  const host = Array.isArray(row.users) ? row.users[0] : row.users;
  return {
    id: row.id,
    hostId: row.host_id,
    host: host
      ? {
          id: host.id,
          displayName: host.display_name,
          avatarUrl: host.avatar_url ?? undefined,
        }
      : { id: row.host_id, displayName: 'Unknown' },
    title: row.title,
    description: row.description ?? undefined,
    locationName: row.location_name ?? undefined,
    location: row.location?.coordinates
      ? { latitude: row.location.coordinates[1], longitude: row.location.coordinates[0] }
      : undefined,
    scheduledAt: row.scheduled_at,
    maxParticipants: row.max_participants,
    currentParticipants: row.current_participants ?? 0,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapParticipant(row: any) {
  const user = Array.isArray(row.users) ? row.users[0] : row.users;
  return {
    id: row.id,
    activityId: row.activity_id,
    userId: row.user_id,
    user: user
      ? {
          id: user.id,
          displayName: user.display_name,
          avatarUrl: user.avatar_url ?? undefined,
        }
      : { id: row.user_id, displayName: 'Unknown' },
    status: row.status,
    requestedAt: row.requested_at,
    respondedAt: row.responded_at ?? undefined,
  };
}
