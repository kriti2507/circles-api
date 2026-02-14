# Circles API Reference

Base URL: `http://localhost:3000/api/v1`

All authenticated endpoints require: `Authorization: Bearer <access_token>`

All error responses follow: `{ "error": { "code": "ERROR_CODE", "message": "Human-readable message" } }`

---

## Auth

### POST `/auth/request-code`

Send an OTP code to a phone number via SMS.

**Request:**
```json
{
  "phone": "+14155551234"
}
```

**Response** `200`:
```json
{
  "success": true,
  "expiresIn": 60
}
```

---

### POST `/auth/verify-code`

Verify the OTP code and get auth tokens. Creates a new user if first login.

**Request:**
```json
{
  "phone": "+14155551234",
  "code": "123456"
}
```

**Response** `200`:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "v1.refresh-token...",
  "user": {
    "id": "uuid",
    "phone": "+14155551234",
    "phoneVerified": true,
    "displayName": "User 1234",
    "bio": null,
    "avatarUrl": null,
    "city": null,
    "countryCode": null,
    "location": null,
    "languages": [],
    "interests": [],
    "status": "active",
    "lastActiveAt": null,
    "createdAt": "2026-02-13T00:00:00.000Z",
    "updatedAt": "2026-02-13T00:00:00.000Z"
  },
  "isNewUser": true
}
```

---

### POST `/auth/refresh`

Refresh an expired access token.

**Headers:** `Authorization: Bearer <refresh_token>`

**Response** `200`:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "v1.new-refresh-token..."
}
```

---

### POST `/auth/logout`

Sign out the current user. **Requires auth.**

**Response** `200`:
```json
{
  "success": true
}
```

---

## Users

All endpoints require authentication.

### GET `/users/me`

Get the current user's full profile, settings, and active circle.

**Response** `200`:
```json
{
  "user": {
    "id": "uuid",
    "phone": "+14155551234",
    "phoneVerified": true,
    "displayName": "Alice",
    "bio": "Love hiking and coffee",
    "avatarUrl": "https://storage.example.com/avatars/...",
    "city": "San Francisco",
    "countryCode": "US",
    "location": { "latitude": 37.7749, "longitude": -122.4194 },
    "languages": ["en", "ja"],
    "interests": ["hiking", "coffee", "photography"],
    "status": "active",
    "lastActiveAt": "2026-02-13T12:00:00.000Z",
    "createdAt": "2026-02-01T00:00:00.000Z",
    "updatedAt": "2026-02-13T12:00:00.000Z"
  },
  "settings": {
    "userId": "uuid",
    "language": "en",
    "notificationsEnabled": true,
    "notificationsMessages": true,
    "notificationsPrompts": true,
    "notificationsActivities": true,
    "distanceUnit": "km",
    "updatedAt": "2026-02-01T00:00:00.000Z"
  },
  "circle": {
    "id": "uuid",
    "name": "The Curious Explorers",
    "status": "active",
    "currentPromptId": "uuid",
    "promptDeliveredAt": "2026-02-12T09:00:00.000Z",
    "createdAt": "2026-02-05T00:00:00.000Z",
    "updatedAt": "2026-02-12T09:00:00.000Z",
    "members": [
      {
        "id": "uuid",
        "displayName": "Alice",
        "avatarUrl": "https://...",
        "status": "active",
        "joinedAt": "2026-02-05T00:00:00.000Z"
      }
    ],
    "prompt": {
      "id": "uuid",
      "textEn": "What's a skill you've always wanted to learn?",
      "textJa": null,
      "textZh": null,
      "category": "conversation",
      "isActive": true,
      "createdAt": "2026-01-01T00:00:00.000Z"
    }
  }
}
```

`circle` is `null` if the user is not in an active circle.

---

### PUT `/users/me`

Update profile fields. All fields are optional.

**Request:**
```json
{
  "displayName": "Alice W.",
  "bio": "Updated bio",
  "city": "Tokyo",
  "countryCode": "JP",
  "location": { "latitude": 35.6762, "longitude": 139.6503 },
  "languages": ["en", "ja"],
  "interests": ["hiking", "coffee", "ramen"]
}
```

**Response** `200`:
```json
{
  "user": { ... }
}
```

---

### PUT `/users/me/avatar`

Upload a profile photo. Uses `multipart/form-data`.

**Request:** Form field `image` with an image file (max 5MB).

**Response** `200`:
```json
{
  "avatarUrl": "https://storage.example.com/avatars/uuid/1707840000000.jpg"
}
```

---

### GET `/users/me/settings`

**Response** `200`:
```json
{
  "settings": {
    "userId": "uuid",
    "language": "en",
    "notificationsEnabled": true,
    "notificationsMessages": true,
    "notificationsPrompts": true,
    "notificationsActivities": true,
    "distanceUnit": "km",
    "updatedAt": "2026-02-01T00:00:00.000Z"
  }
}
```

---

### PUT `/users/me/settings`

Update settings. All fields are optional.

**Request:**
```json
{
  "language": "ja",
  "notificationsEnabled": true,
  "notificationsMessages": false,
  "distanceUnit": "miles"
}
```

**Response** `200`:
```json
{
  "settings": { ... }
}
```

---

### DELETE `/users/me`

Soft-delete the account. Sets user status to `deleted`, removes matching queue entry and push tokens.

**Response** `200`:
```json
{
  "success": true
}
```

---

### POST `/users/:id/block`

Block another user.

**Response** `200`:
```json
{
  "success": true
}
```

**Error** `409` if already blocked:
```json
{
  "error": { "code": "ALREADY_BLOCKED", "message": "User is already blocked" }
}
```

---

### DELETE `/users/:id/block`

Unblock a user.

**Response** `200`:
```json
{
  "success": true
}
```

---

### POST `/users/:id/report`

Report a user.

**Request:**
```json
{
  "reason": "harassment",
  "details": "Optional description of the issue"
}
```

`reason` must be one of: `harassment`, `spam`, `inappropriate`, `no_show`, `other`.

**Response** `200`:
```json
{
  "success": true
}
```

---

## Circles

All endpoints require authentication.

### GET `/circles/mine`

Get the user's active circle with members and current prompt.

**Response** `200` (in a circle):
```json
{
  "circle": {
    "id": "uuid",
    "name": "The Friendly Wanderers",
    "status": "active",
    "currentPromptId": "uuid",
    "promptDeliveredAt": "2026-02-12T09:00:00.000Z",
    "createdAt": "2026-02-05T00:00:00.000Z",
    "updatedAt": "2026-02-12T09:00:00.000Z"
  },
  "members": [
    {
      "id": "uuid",
      "displayName": "Alice",
      "avatarUrl": "https://...",
      "status": "active",
      "joinedAt": "2026-02-05T00:00:00.000Z"
    },
    {
      "id": "uuid",
      "displayName": "Bob",
      "status": "active",
      "joinedAt": "2026-02-05T00:00:00.000Z"
    }
  ],
  "prompt": {
    "id": "uuid",
    "textEn": "Plan a group outing this weekend!",
    "category": "social",
    "isActive": true,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

**Response** `200` (not in a circle): `null`

---

### POST `/circles/join-queue`

Join the matching queue. Immediately triggers the matching algorithm.

**Response** `200`:
```json
{
  "position": 3,
  "estimatedWait": "Checking for compatible matches..."
}
```

**Error** `409`:
```json
{
  "error": { "code": "ALREADY_IN_CIRCLE", "message": "You are already in an active circle" }
}
```

---

### DELETE `/circles/leave-queue`

Leave the matching queue.

**Response** `200`:
```json
{
  "success": true
}
```

---

### POST `/circles/mine/leave`

Leave the current circle. Posts a system message notifying other members.

**Response** `200`:
```json
{
  "success": true
}
```

---

### GET `/circles/mine/messages`

Get messages for the current circle. Uses cursor-based pagination.

**Query parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `before` | string | - | ISO timestamp cursor (fetch messages before this time) |
| `limit` | number | 50 | Max messages to return (1-100) |

**Response** `200`:
```json
{
  "messages": [
    {
      "id": "uuid",
      "circleId": "uuid",
      "senderId": "uuid",
      "senderName": "Alice",
      "senderAvatar": "https://...",
      "content": "Hey everyone!",
      "messageType": "text",
      "createdAt": "2026-02-13T12:00:00.000Z"
    },
    {
      "id": "uuid",
      "circleId": "uuid",
      "senderId": "uuid",
      "senderName": "System",
      "content": "Bob joined the circle",
      "messageType": "system",
      "createdAt": "2026-02-05T00:00:00.000Z"
    }
  ],
  "hasMore": true
}
```

---

### POST `/circles/mine/messages`

Send a message to the current circle.

**Request:**
```json
{
  "content": "Hey everyone!"
}
```

**Response** `201`:
```json
{
  "message": {
    "id": "uuid",
    "circleId": "uuid",
    "senderId": "uuid",
    "senderName": "Alice",
    "senderAvatar": "https://...",
    "content": "Hey everyone!",
    "messageType": "text",
    "createdAt": "2026-02-13T12:00:00.000Z"
  }
}
```

---

## Activities

All endpoints require authentication.

### GET `/activities`

Get nearby activities using PostGIS spatial search.

**Query parameters:**
| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `lat` | number | Yes | - | User latitude |
| `lng` | number | Yes | - | User longitude |
| `radius` | number | No | 10 | Search radius in km |
| `status` | string | No | - | Filter by status (`open`, `full`, `completed`, `cancelled`) |

**Response** `200`:
```json
{
  "activities": [
    {
      "id": "uuid",
      "hostId": "uuid",
      "host": {
        "id": "uuid",
        "displayName": "Alice",
        "avatarUrl": "https://..."
      },
      "title": "Morning hike at Twin Peaks",
      "description": "Easy 2-hour hike with great views",
      "locationName": "Twin Peaks, San Francisco",
      "location": { "latitude": 37.7544, "longitude": -122.4477 },
      "scheduledAt": "2026-02-15T08:00:00.000Z",
      "maxParticipants": 6,
      "currentParticipants": 3,
      "status": "open",
      "createdAt": "2026-02-13T00:00:00.000Z",
      "updatedAt": "2026-02-13T00:00:00.000Z"
    }
  ]
}
```

---

### GET `/activities/mine`

Get activities you're hosting or participating in.

**Query parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | string | `hosting` | `hosting` or `participating` |

**Response** `200`:
```json
{
  "activities": [ ... ]
}
```

---

### GET `/activities/:id`

Get a single activity with participants and your participation status.

**Response** `200`:
```json
{
  "activity": { ... },
  "participants": [
    {
      "id": "uuid",
      "activityId": "uuid",
      "userId": "uuid",
      "user": {
        "id": "uuid",
        "displayName": "Bob",
        "avatarUrl": "https://..."
      },
      "status": "approved",
      "requestedAt": "2026-02-13T10:00:00.000Z",
      "respondedAt": "2026-02-13T10:05:00.000Z"
    }
  ],
  "isParticipating": true
}
```

---

### POST `/activities`

Create a new activity. The host is automatically added as an approved participant.

**Request:**
```json
{
  "title": "Morning hike at Twin Peaks",
  "description": "Easy 2-hour hike with great views",
  "locationName": "Twin Peaks, San Francisco",
  "lat": 37.7544,
  "lng": -122.4477,
  "scheduledAt": "2026-02-15T08:00:00.000Z",
  "maxParticipants": 6
}
```

`maxParticipants` defaults to 6 if omitted. Minimum is 2.

**Response** `201`:
```json
{
  "activity": { ... }
}
```

---

### PUT `/activities/:id`

Update an activity. **Host only.** All fields are optional.

**Request:**
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "locationName": "New location",
  "scheduledAt": "2026-02-16T08:00:00.000Z",
  "status": "cancelled"
}
```

**Response** `200`:
```json
{
  "activity": { ... }
}
```

**Error** `403`: `{ "error": { "code": "FORBIDDEN", "message": "Only the host can update this activity" } }`

---

### DELETE `/activities/:id`

Delete an activity. **Host only.**

**Response** `200`:
```json
{
  "success": true
}
```

---

### POST `/activities/:id/join`

Request to join an activity. Status starts as `pending`.

**Response** `200`:
```json
{
  "status": "pending"
}
```

**Error** `409`: `{ "error": { "code": "ALREADY_JOINED", "message": "You have already requested to join" } }`

---

### DELETE `/activities/:id/join`

Withdraw your join request or leave the activity.

**Response** `200`:
```json
{
  "success": true
}
```

---

### PUT `/activities/:id/participants/:userId`

Approve or decline a participant. **Host only.**

**Request:**
```json
{
  "status": "approved"
}
```

`status` must be `approved` or `declined`.

**Response** `200`:
```json
{
  "success": true
}
```

---

### GET `/activities/:id/messages`

Get messages for an activity chat. **Approved participants only.** Uses cursor-based pagination.

**Query parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `before` | string | - | ISO timestamp cursor |
| `limit` | number | 50 | Max messages (1-100) |

**Response** `200`:
```json
{
  "messages": [ ... ],
  "hasMore": false
}
```

---

### POST `/activities/:id/messages`

Send a message to an activity chat. **Approved participants only.**

**Request:**
```json
{
  "content": "Looking forward to it!"
}
```

**Response** `201`:
```json
{
  "message": { ... }
}
```

---

## Notifications

All endpoints require authentication.

### POST `/push-tokens`

Register an Expo push token for the current device.

**Request:**
```json
{
  "token": "ExponentPushToken[xxxx]",
  "platform": "ios"
}
```

`platform` must be `ios` or `android`.

**Response** `200`:
```json
{
  "success": true
}
```

---

### DELETE `/push-tokens`

Unregister a push token (e.g. on logout).

**Request:**
```json
{
  "token": "ExponentPushToken[xxxx]"
}
```

**Response** `200`:
```json
{
  "success": true
}
```

---

## Error Codes

| HTTP | Code | Description |
|------|------|-------------|
| 400 | `BAD_REQUEST` | Invalid request data |
| 400 | `VALIDATION_ERROR` | Zod schema validation failed |
| 400 | `OTP_ERROR` | Failed to send OTP |
| 401 | `UNAUTHORIZED` | Missing or invalid auth token |
| 401 | `VERIFICATION_FAILED` | OTP code incorrect |
| 401 | `REFRESH_FAILED` | Refresh token invalid |
| 403 | `FORBIDDEN` | Insufficient permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 409 | `CONFLICT` | Duplicate operation |
| 409 | `ALREADY_BLOCKED` | User already blocked |
| 409 | `ALREADY_JOINED` | Already joined activity |
| 409 | `ALREADY_IN_CIRCLE` | Already in a circle |
| 409 | `ALREADY_IN_QUEUE` | Already in matching queue |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
