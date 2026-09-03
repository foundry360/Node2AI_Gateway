#!/bin/bash

# Hyperledger Fabric Test Network Setup Script
# This script sets up the Fabric test network for Node2AI blockchain integration

set -e

echo "🚀 Setting up Hyperledger Fabric Test Network for Node2AI"
echo ""

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found!"
    echo "Please install Docker Desktop first:"
    echo "  https://www.docker.com/products/docker-desktop/"
    echo ""
    echo "Or via Homebrew:"
    echo "  brew install --cask docker"
    exit 1
fi

# Check Docker is running
if ! docker ps &> /dev/null; then
    echo "❌ Docker is not running!"
    echo "Please start Docker Desktop and try again."
    exit 1
fi

echo "✅ Docker found and running"
echo ""

# Create hyperledger directory
HYPERLEDGER_DIR="$HOME/hyperledger"
if [ ! -d "$HYPERLEDGER_DIR" ]; then
    mkdir -p "$HYPERLEDGER_DIR"
    echo "✅ Created $HYPERLEDGER_DIR"
fi

# Clone fabric samples if not exists
cd "$HYPERLEDGER_DIR"
if [ ! -d "fabric-samples" ]; then
    echo "📥 Cloning fabric-samples..."
    git clone https://github.com/hyperledger/fabric-samples.git
else
    echo "✅ fabric-samples already exists"
fi

cd fabric-samples

# Bootstrap fabric (download binaries and images)
if [ ! -f "bin/peer" ]; then
    echo "📦 Downloading Fabric binaries and images..."
    echo "⏳ This will take several minutes..."
    ./scripts/bootstrap.sh
else
    echo "✅ Fabric binaries already installed"
fi

# Copy our chaincode
echo ""
echo "📁 Setting up Node2AI chaincode..."
CHAINCODE_DIR="chaincode/node2ai"
if [ ! -d "$CHAINCODE_DIR" ]; then
    mkdir -p "$CHAINCODE_DIR"
fi

# Copy from our blockchain directory
cp -r /Users/jasongelsomino/Projects/Node2/blockchain/chaincode/* "$CHAINCODE_DIR/"

echo "✅ Chaincode copied"
echo ""
echo "✅ Fabric setup complete!"
echo ""
echo "Next steps:"
echo "  1. cd ~/hyperledger/fabric-samples/test-network"
echo "  2. ./network.sh up createChannel -c node2aichannel -ca"
echo "  3. Follow the chaincode deployment steps in FABRIC_SETUP_INSTRUCTIONS.md"
echo ""
echo "Or run the deployment script:"
echo "  cd ~/hyperledger/fabric-samples/test-network && npm run blockchain:deploy"

