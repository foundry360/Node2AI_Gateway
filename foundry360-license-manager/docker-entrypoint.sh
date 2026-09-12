#!/bin/sh
set -e
echo "Running database migrations..."
npx prisma migrate deploy
echo "Seeding users (idempotent)..."
npx prisma db seed || node prisma/seed.mjs
echo "Starting Foundry360 License Manager on :${PORT:-3085}"
exec node server.js
