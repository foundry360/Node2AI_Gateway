# Hyperledger Fabric Blockchain Integration - Setup Guide

This guide will help you set up and deploy the Hyperledger Fabric blockchain integration for Node2AI.

## Quick Start

### Prerequisites

1. **Hyperledger Fabric Test Network** (already set up at `~/hyperledger/fabric-samples/test-network`)
2. **Chaincode deployed** with name `node2ai`
3. **Channel created** named `node2aichannel`
4. **Node.js** (v18+) and `pnpm` installed

### Step 1: Install Dependencies

```bash
# Install npm dependencies
pnpm install
```

### Step 2: Enroll Blockchain Identities

```bash
# This creates admin and appUser identities in blockchain/wallet/
npm run blockchain:enroll
```

Expected output:

```
Creating wallet directory...
Admin enrolled successfully
appUser registered and enrolled successfully
```

### Step 3: Test Blockchain Integration

```bash
# Test the blockchain connection and functionality
npm run blockchain:test
```

Expected output:

```
=== Starting Blockchain Integration Test ===
✓ Blockchain connected
✓ Hash verification passed
✓ Interaction recorded successfully
✓ All tests passed!
```

### Step 4: Start Node2AI API

```bash
# Start the API server
pnpm run dev:api
```

The blockchain service will automatically connect when the API starts.

## What Was Created

### 1. Smart Contract (`blockchain/chaincode/audit-trail.go`)

- Go chaincode for Hyperledger Fabric
- Functions for recording and querying AI interactions
- Immutable audit trail storage

### 2. Fabric SDK Adapter (`blockchain/sdk/fabric-adapter.ts`)

- TypeScript wrapper for Fabric Network SDK
- Handles connection, enrollment, and queries

### 3. Blockchain Service (`apps/api/src/lib/blockchain/blockchain.service.ts`)

- High-level service for recording audit events
- Automatic PHI compliance verification
- Optional operation (doesn't break AI if blockchain unavailable)

### 4. Integration Points

#### Modified AI Chat Route (`apps/api/src/app/api/v1/chat/completions/route.ts`)

- Added blockchain audit logging
- Records after each AI interaction
- Includes PHI detection metadata

#### New Blockchain Routes (`apps/api/src/app/api/v1/blockchain/`)

- `GET /audit/:requestId` - Get specific audit record
- `GET /audit/organization/:orgId` - Get org records
- `GET /audit/range/:startDate/:endDate` - Date range query
- `GET /compliance/:requestId` - Verify PHI compliance

### 5. Enrollment Scripts

- `enroll-admin.ts` - Enrolls admin identity
- `register-user.ts` - Registers app user

### 6. Test Script

- `test-integration.ts` - Comprehensive integration test

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Enable/disable blockchain (default: true)
BLOCKCHAIN_ENABLED=true
```

### Connection Profile

Default connection profile path:

```
~/hyperledger/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json
```

To use a different network, update in `apps/api/src/lib/blockchain/blockchain.service.ts`.

## Testing

### 1. Test Blockchain Connection

```bash
npm run blockchain:test
```

### 2. Test AI Request with Blockchain Logging

```bash
curl -X POST http://localhost:3001/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "messages": [
      {"role": "user", "content": "Patient John Doe, MRN 12345, DOB 01/15/1980"}
    ],
    "model": "gpt-4"
  }'
```

Check logs for:

```
Blockchain audit event recorded: {requestId}
```

### 3. Query Blockchain Audit Trail

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/v1/blockchain/audit/{requestId}
```

### 4. Verify PHI Compliance

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/v1/blockchain/compliance/{requestId}
```

Expected response:

```json
{
  "success": true,
  "data": {
    "isCompliant": true,
    "message": "PASS: Input was sanitized before sending to AI provider"
  }
}
```

## Troubleshooting

### Error: "Connection profile not found"

**Solution**: Verify Fabric test network is running:

```bash
cd ~/hyperledger/fabric-samples/test-network
./network.sh up createChannel -c node2aichannel -ca
```

### Error: "User identity not found in wallet"

**Solution**: Run enrollment script:

```bash
npm run blockchain:enroll
```

### Error: "Chaincode not found"

**Solution**: Verify chaincode is deployed with name `node2ai`. Check in `blockchain.service.ts` if you're using a different name.

### Blockchain Not Connecting

Check if blockchain is enabled:

```bash
grep BLOCKCHAIN_ENABLED .env
```

If set to `false`, blockchain logging is disabled (non-production mode).

### Performance Issues

Blockchain operations are asynchronous and won't block AI requests. If blockchain is slow:

1. Check Fabric network performance
2. Monitor blockchain operation logs
3. Consider using blockchain only for critical interactions

## Production Deployment

### 1. Use Production Blockchain

Don't use the test network. Set up a production Fabric network:

- AWS Managed Blockchain
- IBM Blockchain Platform
- Kaleido BaaS
- Custom Fabric deployment

### 2. Update Connection Profile

Update `connectionProfilePath` in `blockchain.service.ts` to point to production connection profile.

### 3. Secure Wallet

- Encrypt the `blockchain/wallet/` directory
- Use secrets management (AWS Secrets Manager, HashiCorp Vault)
- Implement proper access controls

### 4. Monitor Performance

- Track blockchain operation success rate
- Monitor blockchain query latency
- Set up alerts for blockchain failures

### 5. Backup Strategy

- Backup wallet directory securely
- Export blockchain state periodically
- Implement disaster recovery procedures

## What Gets Recorded on Blockchain

Each AI interaction creates an immutable record with:

- **Identification**: Request ID, timestamp, organization, user
- **Data Hashes**: SHA256 hashes of input and sanitized input
- **PHI Metadata**: Types detected (PERSON, MRN, DATE, etc.)
- **Verification**: Boolean flags (phiExposed=false, hipaaCompliant=true)
- **Usage**: AI provider, model, tokens, cost
- **Performance**: Processing time

**Important**: No actual PHI is stored on blockchain, only cryptographic hashes.

## API Endpoints

### GET /api/v1/blockchain/audit/:requestId

Get specific audit record from blockchain.

### GET /api/v1/blockchain/audit/organization/:orgId

Get all audit records for an organization.

### GET /api/v1/blockchain/audit/range/:startDate/:endDate

Get audit records within a date range.

- Dates must be RFC3339 format (e.g., `2024-01-01T00:00:00Z`)

### GET /api/v1/blockchain/compliance/:requestId

Verify PHI compliance for a specific interaction.

## Summary

✅ Blockchain integration complete
✅ Immutable audit trails enabled
✅ PHI compliance verification
✅ Optional operation (doesn't break AI)
✅ Ready for production with proper setup

For questions or issues, see `blockchain/README.md` or check the Fabric logs:

```bash
docker logs peer0.org1.example.com
```
