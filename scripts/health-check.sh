#!/bin/bash
# Comprehensive health check for Node2AI Enterprise

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

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

echo "Node2AI Enterprise Health Check"
echo "================================"
echo ""

# Check API health endpoint
echo "1. API Server Health"
if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    RESPONSE=$(curl -s http://localhost:3001/api/health)
    if echo "$RESPONSE" | grep -q "status"; then
        log_pass "API server is responding"
        echo "   Response: $RESPONSE"
    else
        log_fail "API server returned invalid response"
    fi
else
    log_fail "API server is not responding"
fi
echo ""

# Check Web dashboard
echo "2. Web Dashboard"
if curl -sf http://localhost:3000 > /dev/null 2>&1; then
    log_pass "Web dashboard is accessible"
else
    log_fail "Web dashboard is not accessible"
fi
echo ""

# Check database connectivity
echo "3. Database Connectivity"
if command -v docker-compose &> /dev/null && [ -f "docker/docker-compose.yml" ]; then
    if docker-compose -f docker/docker-compose.yml exec -T postgres pg_isready -U node2ai > /dev/null 2>&1; then
        log_pass "PostgreSQL is ready"
    else
        log_fail "PostgreSQL is not ready"
    fi
elif [ -f "/etc/systemd/system/node2ai.service" ]; then
    # Check if PostgreSQL is accessible
    if command -v psql &> /dev/null; then
        if psql -h localhost -U node2ai -d node2ai -c "SELECT 1" > /dev/null 2>&1; then
            log_pass "PostgreSQL is accessible"
        else
            log_fail "PostgreSQL is not accessible"
        fi
    else
        log_warn "psql not found, skipping database check"
    fi
else
    log_warn "Database check not available for this deployment"
fi
echo ""

# Check Redis connectivity
echo "4. Redis Connectivity"
if command -v docker-compose &> /dev/null && [ -f "docker/docker-compose.yml" ]; then
    if docker-compose -f docker/docker-compose.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
        log_pass "Redis is responding"
    else
        log_fail "Redis is not responding"
    fi
elif command -v redis-cli &> /dev/null; then
    if redis-cli -h localhost ping > /dev/null 2>&1; then
        log_pass "Redis is responding"
    else
        log_fail "Redis is not responding"
    fi
else
    log_warn "redis-cli not found, skipping Redis check"
fi
echo ""

# Check disk space
echo "5. Disk Space"
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -lt 80 ]; then
    log_pass "Disk usage: ${DISK_USAGE}%"
else
    log_fail "Disk usage: ${DISK_USAGE}% (above 80%)"
fi
echo ""

# Check memory
echo "6. Memory Usage"
if command -v free &> /dev/null; then
    MEM_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    if [ "$MEM_USAGE" -lt 90 ]; then
        log_pass "Memory usage: ${MEM_USAGE}%"
    else
        log_fail "Memory usage: ${MEM_USAGE}% (above 90%)"
    fi
else
    log_warn "free command not available, skipping memory check"
fi
echo ""

# Summary
echo "================================"
echo "Summary: $PASSED passed, $FAILED failed"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All health checks passed!${NC}"
    exit 0
else
    echo -e "${RED}Some health checks failed. Please review the output above.${NC}"
    exit 1
fi
