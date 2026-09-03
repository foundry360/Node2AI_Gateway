#!/bin/bash

# Deploy Node2AI Chaincode to Hyperledger Fabric Network
# This script deploys the audit-trail chaincode to the node2aichannel

set -e

NETWORK_DIR="$HOME/hyperledger/fabric-samples/test-network"
CHAINCODE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/chaincode"
CHANNEL_NAME="node2aichannel"
CHAINCODE_NAME="node2ai"
CHAINCODE_VERSION="1.1"
CHAINCODE_SEQUENCE="1"

echo "🔗 Deploying Node2AI Chaincode to Fabric Network"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Check prerequisites
if [ ! -d "$NETWORK_DIR" ]; then
    echo "❌ Error: Fabric network directory not found at $NETWORK_DIR"
    exit 1
fi

if [ ! -d "$CHAINCODE_DIR" ]; then
    echo "❌ Error: Chaincode directory not found at $CHAINCODE_DIR"
    exit 1
fi

cd "$NETWORK_DIR"

# Set PATH to include Fabric binaries and Go
export PATH="/usr/local/go/bin:$HOME/go/bin:$HOME/hyperledger/fabric-samples/bin:$PATH"
export FABRIC_CFG_PATH="$NETWORK_DIR/../config"

# Source environment variables
echo "📋 Setting up environment..."
source scripts/envVar.sh
setGlobals 1

# Package chaincode
echo ""
echo "📦 Packaging chaincode..."
peer lifecycle chaincode package "${CHAINCODE_NAME}.tar.gz" \
    --path "$CHAINCODE_DIR" \
    --lang golang \
    --label "${CHAINCODE_NAME}_${CHAINCODE_VERSION}"

if [ ! -f "${CHAINCODE_NAME}.tar.gz" ]; then
    echo "❌ Error: Failed to package chaincode"
    exit 1
fi

echo "✅ Chaincode packaged: ${CHAINCODE_NAME}.tar.gz"

# Install on Org1 peer
echo ""
echo "📥 Installing chaincode on Org1 peer..."
setGlobals 1
peer lifecycle chaincode install "${CHAINCODE_NAME}.tar.gz"

# Get package ID
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled --output json | jq -r '.installed_chaincodes[] | select(.label=="'"${CHAINCODE_NAME}_${CHAINCODE_VERSION}"'") | .package_id')

if [ -z "$PACKAGE_ID" ] || [ "$PACKAGE_ID" = "null" ]; then
    echo "❌ Error: Failed to get package ID"
    exit 1
fi

echo "✅ Chaincode installed on Org1. Package ID: $PACKAGE_ID"

# Install on Org2 peer
echo ""
echo "📥 Installing chaincode on Org2 peer..."
setGlobals 2
peer lifecycle chaincode install "${CHAINCODE_NAME}.tar.gz"
echo "✅ Chaincode installed on Org2"

# Approve for Org1
echo ""
echo "✅ Approving chaincode for Org1..."
setGlobals 1
peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$CHAINCODE_VERSION" \
    --package-id "$PACKAGE_ID" \
    --sequence "$CHAINCODE_SEQUENCE" \
    --tls \
    --cafile "$ORDERER_CA"

echo "✅ Org1 approval complete"

# Approve for Org2
echo ""
echo "✅ Approving chaincode for Org2..."
setGlobals 2
peer lifecycle chaincode approveformyorg \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$CHAINCODE_VERSION" \
    --package-id "$PACKAGE_ID" \
    --sequence "$CHAINCODE_SEQUENCE" \
    --tls \
    --cafile "$ORDERER_CA"

echo "✅ Org2 approval complete"

# Check commit readiness
echo ""
echo "🔍 Checking commit readiness..."
peer lifecycle chaincode checkcommitreadiness \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$CHAINCODE_VERSION" \
    --sequence "$CHAINCODE_SEQUENCE" \
    --tls \
    --cafile "$ORDERER_CA" \
    --output json

# Commit chaincode
echo ""
echo "🚀 Committing chaincode to channel..."
peer lifecycle chaincode commit \
    -o localhost:7050 \
    --ordererTLSHostnameOverride orderer.example.com \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --version "$CHAINCODE_VERSION" \
    --sequence "$CHAINCODE_SEQUENCE" \
    --tls \
    --cafile "$ORDERER_CA" \
    --peerAddresses localhost:7051 \
    --tlsRootCertFiles "$PEER0_ORG1_CA" \
    --peerAddresses localhost:9051 \
    --tlsRootCertFiles "$PEER0_ORG2_CA"

echo "✅ Chaincode committed to channel"

# Query committed chaincode
echo ""
echo "🔍 Verifying chaincode deployment..."
peer lifecycle chaincode querycommitted \
    --channelID "$CHANNEL_NAME" \
    --name "$CHAINCODE_NAME" \
    --tls \
    --cafile "$ORDERER_CA"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Chaincode deployment complete!"
echo ""
echo "Chaincode Details:"
echo "  Name: $CHAINCODE_NAME"
echo "  Version: $CHAINCODE_VERSION"
echo "  Channel: $CHANNEL_NAME"
echo "  Package ID: $PACKAGE_ID"
echo ""
echo "The blockchain is now ready to record audit trails!"

