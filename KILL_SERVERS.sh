#!/bin/bash
# Force kill all Node.js processes from Node2
echo "🛑 Killing all Node2 servers..."
pkill -9 -f "node.*Node2" 2>/dev/null || true
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "pnpm dev" 2>/dev/null || true
sleep 2
echo "✅ All servers killed"
