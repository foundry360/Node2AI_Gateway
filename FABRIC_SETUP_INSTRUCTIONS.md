# Hyperledger Fabric Setup Instructions

## Prerequisites

You need Docker installed. Install Docker Desktop for Mac:

```bash
# Download from: https://www.docker.com/products/docker-desktop/
# Or install via Homebrew:
brew install --cask docker

# Start Docker Desktop, then verify:
docker --version
```

## Step 1: Install Fabric Prerequisites

```bash
# Install prerequisites
brew install git curl

# Install Go (required for chaincode)
brew install go

# Verify Go installation
go version
```

## Step 2: Download Fabric Samples

```bash
# Create hyperledger directory
mkdir -p ~/hyperledger
cd ~/hyperledger

# Clone fabric samples
git clone https://github.com/hyperledger/fabric-samples.git
cd fabric-samples

# Pull Fabric binaries and images
./scripts/bootstrap.sh

# This will take a few minutes - it downloads all Fabric binaries, Docker images, and sample chaincode
```

## Step 3: Copy Our Chaincode

```bash
# From Node2 project directory
cd /Users/jasongelsomino/Projects/Node2

# Create chaincode directory in fabric samples
mkdir -p ~/hyperledger/fabric-samples/chaincode/node2ai

# Copy our chaincode
cp -r blockchain/chaincode/* ~/hyperledger/fabric-samples/chaincode/node2ai/
```

## Step 4: Deploy Chaincode

```bash
cd ~/hyperledger/fabric-samples/test-network

# Set environment variables
export PATH=${PWD}/../bin:${PWD}:$PATH
export FABRIC_CFG_PATH=${PWD}/../config/

# Start the network with CA
./network.sh up createChannel -c node2aichannel -ca

# Set org environment
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051

# Package chaincode
peer lifecycle chaincode package node2ai.tar.gz \
  --path ../chaincode/node2ai \
  --lang golang \
  --label node2ai_1.0

# Install chaincode
peer lifecycle chaincode install node2ai.tar.gz
# Note the package ID from output (e.g., node2ai_1.0:abc123...)

# Approve chaincode (replace PACKAGE_ID with actual ID)
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID node2aichannel \
  --name node2ai \
  --version 1.0 \
  --package-id <PACKAGE_ID> \
  --sequence 1 \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem

# Commit chaincode
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --channelID node2aichannel \
  --name node2ai \
  --version 1.0 \
  --sequence 1 \
  --tls \
  --cafile ${PWD}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles ${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
```

## Step 5: Enroll and Test

```bash
# Back to Node2 project
cd /Users/jasongelsomino/Projects/Node2

# Enroll identities
npm run blockchain:enroll

# Test integration
npm run blockchain:test
```

## Troubleshooting

### Docker Issues

```bash
# Check if Docker is running
docker ps

# If not, start Docker Desktop
# Or restart:
docker restart
```

### Chaincode Issues

```bash
# Check chaincode logs
docker logs dev-peer0.org1.example.com-node2ai-1.0

# Reinstall chaincode if needed
peer lifecycle chaincode install node2ai.tar.gz --force
```

### Network Issues

```bash
# Clean and restart
cd ~/hyperledger/fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c node2aichannel -ca
```

## Once It's Working

Your Node2AI now has immutable blockchain audit trails! 🎉

Every AI request will be recorded on the blockchain with cryptographic proof of PHI sanitization.
