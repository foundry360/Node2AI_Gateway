#!/bin/bash

# Production Blockchain Setup Script for Node2AI
# This script sets up Hyperledger Fabric blockchain for production use

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WALLET_PATH="$PROJECT_ROOT/blockchain/wallet"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Node2AI Production Blockchain Setup                      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 1: Check prerequisites
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    exit 1
fi

# Check if npm/pnpm is installed
if ! command -v pnpm &> /dev/null && ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ Neither pnpm nor npm is installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites met${NC}"
echo ""

# Step 2: Create wallet directory
echo -e "${YELLOW}Step 2: Setting up wallet directory...${NC}"
mkdir -p "$WALLET_PATH"
echo -e "${GREEN}✓ Wallet directory created at: $WALLET_PATH${NC}"
echo ""

# Step 3: Check for connection profile
echo -e "${YELLOW}Step 3: Checking connection profile...${NC}"

CONNECTION_PROFILE="${BLOCKCHAIN_CONNECTION_PROFILE:-${FABRIC_CONNECTION_PROFILE:-$HOME/hyperledger/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json}}"

if [ ! -f "$CONNECTION_PROFILE" ]; then
    echo -e "${YELLOW}⚠️  Connection profile not found at: $CONNECTION_PROFILE${NC}"
    echo ""
    echo -e "${BLUE}You need to:${NC}"
    echo "  1. Set up Hyperledger Fabric network"
    echo "  2. Generate connection profile"
    echo "  3. Set BLOCKCHAIN_CONNECTION_PROFILE environment variable"
    echo ""
    echo -e "${BLUE}For test network:${NC}"
    echo "  cd ~/hyperledger/fabric-samples/test-network"
    echo "  ./network.sh up createChannel -c node2aichannel -ca"
    echo ""
    echo -e "${BLUE}For production:${NC}"
    echo "  Set BLOCKCHAIN_CONNECTION_PROFILE=/path/to/your/connection-profile.json"
    echo ""
    read -p "Continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✓ Connection profile found: $CONNECTION_PROFILE${NC}"
fi
echo ""

# Step 4: Install dependencies
echo -e "${YELLOW}Step 4: Installing dependencies...${NC}"
cd "$PROJECT_ROOT"
if command -v pnpm &> /dev/null; then
    pnpm install
else
    npm install
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 5: Enroll admin identity
echo -e "${YELLOW}Step 5: Enrolling admin identity...${NC}"
if [ -f "$WALLET_PATH/admin.id" ]; then
    echo -e "${YELLOW}⚠️  Admin identity already exists${NC}"
    read -p "Re-enroll admin? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$SCRIPT_DIR"
        node -r ts-node/register sdk/enroll-admin.ts || {
            echo -e "${RED}❌ Failed to enroll admin${NC}"
            exit 1
        }
    fi
else
    cd "$SCRIPT_DIR"
    node -r ts-node/register sdk/enroll-admin.ts || {
        echo -e "${RED}❌ Failed to enroll admin${NC}"
        exit 1
    }
fi
echo -e "${GREEN}✓ Admin identity enrolled${NC}"
echo ""

# Step 6: Register and enroll app user
echo -e "${YELLOW}Step 6: Registering and enrolling app user...${NC}"
USER_ID="${BLOCKCHAIN_USER_ID:-appUser}"
if [ -f "$WALLET_PATH/$USER_ID.id" ]; then
    echo -e "${YELLOW}⚠️  App user identity already exists${NC}"
    read -p "Re-register user? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd "$SCRIPT_DIR"
        # Try improved registration first, fall back to original
        if [ -f "sdk/register-user-improved.ts" ]; then
            node -r ts-node/register sdk/register-user-improved.ts || {
                echo -e "${YELLOW}⚠️  Improved registration failed, trying original...${NC}"
                node -r ts-node/register sdk/register-user.ts || {
                    echo -e "${RED}❌ Failed to register user${NC}"
                    echo -e "${YELLOW}You may need to manually register the user via CA CLI${NC}"
                    exit 1
                }
            }
        else
            node -r ts-node/register sdk/register-user.ts || {
                echo -e "${RED}❌ Failed to register user${NC}"
                echo -e "${YELLOW}You may need to manually register the user via CA CLI${NC}"
                exit 1
            }
        fi
    fi
else
    cd "$SCRIPT_DIR"
    # Try improved registration first, fall back to original
    if [ -f "sdk/register-user-improved.ts" ]; then
        node -r ts-node/register sdk/register-user-improved.ts || {
            echo -e "${YELLOW}⚠️  Improved registration failed, trying original...${NC}"
            node -r ts-node/register sdk/register-user.ts || {
                echo -e "${RED}❌ Failed to register user${NC}"
                echo -e "${YELLOW}You may need to manually register the user via CA CLI${NC}"
                exit 1
            }
        }
    else
        node -r ts-node/register sdk/register-user.ts || {
            echo -e "${RED}❌ Failed to register user${NC}"
            echo -e "${YELLOW}You may need to manually register the user via CA CLI${NC}"
            exit 1
        }
    fi
fi
echo -e "${GREEN}✓ App user identity registered${NC}"
echo ""

# Step 7: Generate signing keys
echo -e "${YELLOW}Step 7: Generating blockchain signing keys...${NC}"
if [ -z "$BLOCKCHAIN_SIGNING_KEY" ]; then
    SIGNING_KEY=$(openssl rand -base64 32)
    echo ""
    echo -e "${GREEN}Generated signing key. Add to your .env file:${NC}"
    echo "BLOCKCHAIN_SIGNING_KEY=$SIGNING_KEY"
    echo ""
    read -p "Save to .env file? (Y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Nn]$ ]]; then
        ENV_FILE="$PROJECT_ROOT/apps/api/.env.local"
        if [ ! -f "$ENV_FILE" ]; then
            touch "$ENV_FILE"
        fi
        if ! grep -q "BLOCKCHAIN_SIGNING_KEY" "$ENV_FILE"; then
            echo "" >> "$ENV_FILE"
            echo "# Blockchain Configuration" >> "$ENV_FILE"
            echo "BLOCKCHAIN_SIGNING_KEY=$SIGNING_KEY" >> "$ENV_FILE"
            echo -e "${GREEN}✓ Signing key saved to $ENV_FILE${NC}"
        else
            echo -e "${YELLOW}⚠️  BLOCKCHAIN_SIGNING_KEY already exists in $ENV_FILE${NC}"
        fi
    fi
else
    echo -e "${GREEN}✓ Signing key already configured${NC}"
fi
echo ""

# Step 8: Test connection
echo -e "${YELLOW}Step 8: Testing blockchain connection...${NC}"
cd "$SCRIPT_DIR"
if [ -f "test-integration.ts" ]; then
    echo -e "${BLUE}Running integration test...${NC}"
    node -r ts-node/register test-integration.ts || {
        echo -e "${YELLOW}⚠️  Integration test failed. This is OK if blockchain network is not running.${NC}"
        echo -e "${BLUE}Start your Hyperledger Fabric network and test again.${NC}"
    }
else
    echo -e "${YELLOW}⚠️  Integration test file not found. Skipping test.${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     Blockchain Setup Complete!                              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next Steps:${NC}"
echo ""
echo "1. Configure environment variables in apps/api/.env.local:"
echo "   BLOCKCHAIN_ENABLED=true"
echo "   BLOCKCHAIN_CONNECTION_PROFILE=/path/to/connection-profile.json"
echo "   BLOCKCHAIN_CHANNEL_NAME=node2aichannel"
echo "   BLOCKCHAIN_CHAINCODE_NAME=node2ai"
echo ""
echo "2. Start Hyperledger Fabric network:"
echo "   cd ~/hyperledger/fabric-samples/test-network"
echo "   ./network.sh up createChannel -c node2aichannel -ca"
echo ""
echo "3. Deploy chaincode (if not already deployed):"
echo "   See blockchain/README.md for chaincode deployment instructions"
echo ""
echo "4. Restart Node2AI API server:"
echo "   cd $PROJECT_ROOT/apps/api"
echo "   pnpm dev"
echo ""
echo -e "${GREEN}✓ Blockchain is ready for production use!${NC}"

