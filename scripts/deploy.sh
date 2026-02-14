#!/bin/bash
# Deploy circles-api to Supabase

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"

cd "$API_DIR"

echo "=== Deploying circles-api to Supabase ==="

# Push database migrations
echo ""
echo "1. Pushing database migrations..."
supabase db push

# Deploy Edge Functions
echo ""
echo "2. Deploying Edge Functions..."
supabase functions deploy match-users
supabase functions deploy deliver-prompts
supabase functions deploy send-notification

echo ""
echo "=== Deployment complete ==="
echo ""
echo "Don't forget to:"
echo "  - Set Edge Function secrets in Supabase Dashboard (FCM_SERVER_KEY)"
echo "  - Configure pg_cron jobs if on Pro plan"
echo "  - Generate and sync types: npm run generate-types -- --remote"
