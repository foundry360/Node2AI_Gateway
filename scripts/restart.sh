#!/bin/bash
# Restart Node2AI Enterprise services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_info "Restarting Node2AI services..."

# Stop services
"$SCRIPT_DIR/stop.sh"

# Wait a moment
sleep 2

# Start services
"$SCRIPT_DIR/start.sh"

log_info "Services restarted successfully!"

