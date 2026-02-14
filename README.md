# circles-api

Supabase backend for the Circles app. Contains database migrations, Row Level Security policies, Edge Functions, and seed data.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for local Supabase)
- [Supabase CLI](https://supabase.com/docs/guides/cli): `brew install supabase/tap/supabase`

## Project Structure

```
supabase/
├── migrations/                         # Database schema (run in order)
│   ├── 20250205000000_init.sql        # Extensions, tables, indexes
│   ├── 20250205000001_rls.sql         # Row Level Security policies
│   ├── 20250205000002_functions.sql   # Triggers, Realtime config
│   └── 20250205000003_cron.sql        # Scheduled job definitions
├── functions/                          # Edge Functions (Deno)
│   ├── match-users/                   # Daily circle matching
│   ├── deliver-prompts/               # Weekly prompt delivery
│   └── send-notification/             # Push notification sender
├── seed.sql                           # Seed data (prompts)
└── config.toml                        # Supabase local config
```

## Getting Started

```bash
# Start local Supabase (starts Postgres, Auth, Storage, Realtime)
npm start

# Reset database and apply all migrations + seed data
npm run reset

# View local Supabase Studio
npm run studio

# Serve Edge Functions locally
npm run functions:serve
```

After starting, note the output:

```
API URL: http://localhost:54321
anon key: eyJ...
service_role key: eyJ...
Studio URL: http://localhost:54323
```

Use the `API URL` and `anon key` in the circles-mobile `.env.development` file.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start local Supabase |
| `npm stop` | Stop local Supabase |
| `npm run status` | Show local Supabase status and URLs |
| `npm run reset` | Reset database (rerun migrations + seed) |
| `npm run migrate` | Push migrations to remote |
| `npm run functions:serve` | Serve Edge Functions locally |
| `npm run generate-types` | Generate TypeScript types for mobile |
| `npm run deploy` | Deploy migrations + functions to remote |
| `npm run studio` | Open Supabase Studio in browser |

## Type Generation

After any schema change, regenerate types for the mobile app:

```bash
# From local
npm run generate-types

# From remote project
npm run generate-types:remote
```

This writes to `../circles-mobile/src/types/database.types.ts`.

## Deployment

### First time setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Link the project:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```
3. Set Edge Function secrets in Supabase Dashboard:
   - `FCM_SERVER_KEY` — Firebase Cloud Messaging server key

### Deploy

```bash
npm run deploy
```

This pushes all migrations and deploys all Edge Functions.

## Edge Functions

| Function | Trigger | Description |
|----------|---------|-------------|
| `match-users` | pg_cron (daily) or manual | Groups queued users into circles of 4 |
| `deliver-prompts` | pg_cron (weekly) or manual | Delivers a new prompt to each active circle |
| `send-notification` | Database webhook or manual | Sends push notification via FCM |

### Testing Edge Functions locally

```bash
# Start functions server
npm run functions:serve

# Call a function
curl -X POST http://localhost:54321/functions/v1/match-users \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json"
```
