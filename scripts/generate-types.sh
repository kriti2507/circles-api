#!/bin/bash
# Generate TypeScript types from Supabase schema and copy to mobile app

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
MOBILE_DIR="$(dirname "$API_DIR")/circles-mobile"
OUTPUT_FILE="$MOBILE_DIR/src/types/database.types.ts"

# Check if mobile directory exists
if [ ! -d "$MOBILE_DIR" ]; then
    echo "Error: circles-mobile directory not found at $MOBILE_DIR"
    exit 1
fi

# Ensure output directory exists
mkdir -p "$(dirname "$OUTPUT_FILE")"

# Generate types
if [ "$1" = "--remote" ]; then
    echo "Generating types from remote project..."
    cd "$API_DIR"
    supabase gen types typescript --project-id "${SUPABASE_PROJECT_ID}" > "$OUTPUT_FILE"
else
    echo "Generating types from local Supabase..."
    cd "$API_DIR"
    supabase gen types typescript --local > "$OUTPUT_FILE"
fi

echo "Types written to $OUTPUT_FILE"
