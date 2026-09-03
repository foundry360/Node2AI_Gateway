#!/bin/bash
# Post-installation validation script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

log_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

echo "Node2AI Enterprise Installation Validation"
echo "=========================================="
echo ""

# Check if services are running
echo "1. Service Status"
if command -v docker-compose &> /dev/null && [ -f "docker/docker-compose.yml" ]; then
    if docker-compose -f docker/docker-compose.yml ps | grep -q "Up"; then
        log_pass "Docker services are running"
    else
        log_fail "Docker services are not running"
    fi
elif [ -f "/etc/systemd/system/node2ai.service" ]; then
    if systemctl is-active --quiet node2ai; then
        log_pass "Systemd service is running"
    else
        log_fail "Systemd service is not running"
    fi
else
    log_fail "No deployment detected"
fi
echo ""

# Check API endpoint
echo "2. API Endpoint"
if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    RESPONSE=$(curl -s http://localhost:3001/api/health)
    if echo "$RESPONSE" | grep -q "status"; then
        log_pass "API endpoint is accessible"
    else
        log_fail "API endpoint returned invalid response"
    fi
else
    log_fail "API endpoint is not accessible"
fi
echo ""

# Check Web dashboard
echo "3. Web Dashboard"
if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    log_pass "Web dashboard is accessible"
else
    log_fail "Web dashboard is not accessible"
fi
echo ""

# Check configuration
echo "4. Configuration"
if [ -f "docker/.env" ] || [ -f "/etc/node2ai/.env" ]; then
    log_pass "Configuration file exists"
    
    # Check for required variables
    ENV_FILE="${ENV_FILE:-docker/.env}"
    if [ -f "$ENV_FILE" ]; then
        if grep -q "LICENSE_KEY" "$ENV_FILE" && ! grep -q "CHANGE_ME" "$ENV_FILE"; then
            log_pass "License key is configured"
        else
            log_fail "License key is not configured"
        fi
    fi
else
    log_fail "Configuration file not found"
fi
echo ""

# Summary
echo "=========================================="
echo "Validation Summary: $PASSED passed, $FAILED failed"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ Installation validation passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Installation validation failed. Please review the errors above.${NC}"
    exit 1
fi

