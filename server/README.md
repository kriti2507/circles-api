# Circles API Server

Express.js REST API middleware that sits between the React Native mobile app and the Supabase backend. Translates the mobile app's 27 REST endpoints into Supabase operations using the service role key.

## Prerequisites

- Node.js 18+
- A running Supabase instance (local or hosted)

## Setup

1. Install dependencies:

```bash
cd circles-api/server
npm install
```

2. Create your `.env` file from the example:

```bash
cp .env.example .env
```

3. Fill in the environment variables:

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: `3000`) |
| `SUPABASE_URL` | Supabase project URL (e.g. `http://localhost:54321`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (has full DB access, bypasses RLS) |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret (used to validate user tokens) |

For local Supabase, find these values with `supabase status` after running `supabase start`.

## Running

**Development** (hot reload via tsx):

```bash
npm run dev
```

**Production build:**

```bash
npm run build
npm start
```

**Type check only:**

```bash
npm run typecheck
```

## Verify

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

## Architecture

```
Mobile App (Expo)
    │
    │  Axios → http://localhost:3000/api/v1/*
    │
    ▼
Express Server (this project)
    │
    │  @supabase/supabase-js (service role)
    │
    ▼
Supabase (Postgres, Auth, Storage, Edge Functions)
```

**Key design decisions:**

- **Service role key** for all DB operations. Auth is enforced in Express middleware (`requireAuth`), not via Supabase RLS. This simplifies complex JOINs and multi-table operations.
- **snake_case <-> camelCase** transformation. The database uses `snake_case`, the mobile app expects `camelCase`. Domain-specific mappers (`mapUser`, `mapActivity`, `mapMessage`, etc.) handle the conversion and flatten JOINs.
- **Error format** matches the mobile app's `parseApiError()`: `{ error: { code, message } }` with appropriate HTTP status codes.
- **No service layer abstraction**. Handlers call the Supabase admin client directly. Each endpoint maps cleanly to 1-3 Supabase queries.

## Project Structure

```
src/
├── server.ts                 # Entry point
├── app.ts                    # Express app factory (CORS, JSON, routes, error handler)
├── config.ts                 # Env var validation (Zod)
├── lib/
│   └── supabase.ts           # Admin Supabase client (service role)
├── middleware/
│   ├── auth.ts               # JWT validation → req.userId
│   ├── errorHandler.ts       # Consistent { error: { code, message } } responses
│   └── validate.ts           # Zod schema validation (body/query/params)
├── utils/
│   ├── asyncHandler.ts       # Wraps async handlers for Express error forwarding
│   ├── caseTransform.ts      # Generic + domain-specific snake/camel mappers
│   └── errors.ts             # AppError class + factory helpers
├── types/
│   └── express.d.ts          # Augments Express Request with userId
├── routes/
│   ├── index.ts              # Mounts all sub-routers at /api/v1
│   ├── auth.routes.ts        # 4 endpoints
│   ├── users.routes.ts       # 9 endpoints
│   ├── circles.routes.ts     # 6 endpoints
│   ├── activities.routes.ts  # 11 endpoints
│   └── notifications.routes.ts # 2 endpoints
└── handlers/
    ├── auth.handlers.ts
    ├── users.handlers.ts
    ├── circles.handlers.ts
    ├── activities.handlers.ts
    └── notifications.handlers.ts
```

## Endpoints

27 total across 5 groups. See [API.md](./API.md) for full reference with request/response examples.

| Group | Count | Auth Required |
|-------|-------|---------------|
| Auth | 4 | Only `POST /auth/logout` |
| Users | 9 | All |
| Circles | 6 | All |
| Activities | 11 | All |
| Notifications | 2 | All |

## Dependencies

| Package | Purpose |
|---------|---------|
| `express` | HTTP framework |
| `cors` | Cross-origin requests |
| `@supabase/supabase-js` | Supabase client (DB, Auth, Storage, Functions) |
| `zod` | Request validation |
| `multer` | Multipart file upload (avatar) |
| `tsx` | TypeScript execution with hot reload (dev) |
