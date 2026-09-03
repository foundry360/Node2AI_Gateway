#!/bin/bash

# Node2AI Startup Script
# This script starts both the API and Web servers

set -e

echo "🚀 Starting Node2AI Servers..."
echo ""

# Check if we're in the project root
if [ ! -d "apps" ]; then
    echo "❌ Error: Must run from project root"
    echo "   Current directory: $(pwd)"
    echo "   Expected: project root with 'apps' directory"
    exit 1
fi

# Check if node_modules exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

echo "✅ Starting servers..."
echo ""
echo "📍 Web app will be at: http://localhost:3000"
echo "📍 API server will be at: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start API server in background
echo "🔧 Starting API server..."
cd apps/api
pnpm dev &
API_PID=$!
cd ../..

# Give API server time to start
sleep 3

# Start Web app
echo "🌐 Starting Web app..."
cd apps/web
pnpm dev &
WEB_PID=$!
cd ../..

# Wait for user interrupt
trap "echo '🛑 Stopping servers...'; kill $API_PID $WEB_PID 2>/dev/null; exit" INT TERM

# Wait for processes
wait $API_PID $WEB_PID

