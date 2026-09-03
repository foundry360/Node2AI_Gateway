#!/bin/bash

# Script to run the license migration
# Usage: ./scripts/run-license-migration.sh [environment]
# Environment options: dev, staging, prod

set -e

ENVIRONMENT=${1:-dev}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "🚀 Running license migration for environment: $ENVIRONMENT"
echo ""

# Load environment variables
if [ -f "$PROJECT_DIR/.env.$ENVIRONMENT" ]; then
  echo "📝 Loading environment from .env.$ENVIRONMENT"
  export $(cat "$PROJECT_DIR/.env.$ENVIRONMENT" | grep -v '^#' | xargs)
elif [ -f "$PROJECT_DIR/.env" ]; then
  echo "📝 Loading environment from .env"
  export $(cat "$PROJECT_DIR/.env" | grep -v '^#' | xargs)
else
  echo "❌ No .env file found. Please create one."
  exit 1
fi

# Check for DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not found in environment"
  exit 1
fi

echo "🔗 Connecting to database..."
echo ""

# Run the migration
MIGRATION_FILE="$PROJECT_DIR/migrations/add_licenses_table.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Migration file not found: $MIGRATION_FILE"
  exit 1
fi

# Execute migration
psql "$DATABASE_URL" -f "$MIGRATION_FILE"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Migration completed successfully!"
  echo ""
  echo "Verifying installation..."
  
  # Quick verification
  psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM licenses;" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "✅ Licenses table verified"
  fi
  
  psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM active_licenses_summary;" > /dev/null 2>&1
  if [ $? -eq 0 ]; then
    echo "✅ Active licenses view verified"
  fi
  
  echo ""
  echo "🎉 License database setup complete!"
else
  echo ""
  echo "❌ Migration failed"
  exit 1
fi

