# Hyperledger Fabric Blockchain Integration for Node2AI

This directory contains the blockchain integration for immutable audit trails of AI interactions in Node2AI.

## Overview

The blockchain integration provides cryptographically verifiable proof that:

1. PHI was detected and sanitized before sending to AI providers
2. AI providers never received original PHI
3. All interactions are recorded immutably
4. Records cannot be altered or deleted

## Directory Structure

```
blockchain/
├── chaincode/
│   ├── audit-trail.go       # Go smart contract
│   ├── go.mod               # Go module dependencies
│   └── go.sum               # Go module checksums
├── sdk/
│   ├── fabric-adapter.ts    # TypeScript Fabric SDK wrapper
│   ├── enroll-admin.ts      # Admin enrollment script
│   └── register-user.ts     # User registration script
├── wallet/                  # Crypto material (gitignored)
└── test-integration.ts      # Integration test script
```

## Prerequisites

1. **Hyperledger Fabric Test Network Running**

   ```bash
   cd ~/hyperledger/fabric-samples/test-network
   ./network.sh up createChannel -c node2aichannel -ca
   ```

2. **Chaincode Deployed**

   ```bash
   # Navigate to chaincode directory
   cd blockchain/chaincode

   # Install dependencies
   go mod tidy

   # Deploy chaincode (from test-network directory)
   cd ~/hyperledger/fabric-samples/test-network
   # ... deploy chaincode following Hyperledger Fabric documentation
   ```

3. **Node.js Dependencies Installed**
   ```bash
   pnpm install
   ```

## Setup

### 1. Enroll Admin and Register User

```bash
# This will create identities in blockchain/wallet/
npm run blockchain:enroll
```

This command:

- Enrolls the `admin` identity with the CA
- Registers and enrolls the `appUser` identity
- Stores credentials in `blockchain/wallet/`

### 2. Run Integration Test

```bash
# Test blockchain connection and functionality
npm run blockchain:test
```

## Configuration

The blockchain service is configured via environment variables:

- `BLOCKCHAIN_ENABLED` - Enable/disable blockchain (default: `true`)
  - Set to `false` to disable blockchain audit logging (non-production)

Connection settings are hardcoded to use the Fabric test network:

- Connection profile: `~/hyperledger/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json`
- Channel: `node2aichannel`
- Chaincode: `node2ai`
- MSP: `Org1MSP`

## Usage

### Automatic Integration

The blockchain service automatically records audit events when AI requests are processed through `/api/v1/chat/completions`.

### Query Audit Trail

#### Get Specific Audit Record

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/v1/blockchain/audit/{requestId}
```

#### Get All Records for Organization

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/v1/blockchain/audit/organization/{orgId}
```

#### Get Records by Date Range

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/v1/blockchain/audit/range/2024-01-01T00:00:00Z/2024-12-31T23:59:59Z
```

#### Verify PHI Compliance

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3001/api/v1/blockchain/compliance/{requestId}
```

## Smart Contract Functions

### RecordInteraction(requestId, interactionJSON)

Stores a new AI interaction on the blockchain.

### QueryInteraction(requestId)

Retrieves a specific interaction by requestId.

### QueryInteractionsByOrganization(orgId)

Gets all interactions for a specific organization.

### QueryInteractionsByDateRange(startDate, endDate)

Retrieves interactions within a date range.

### GetInteractionHistory(requestId)

Shows modification history of an interaction.

### VerifyPHICompliance(requestId)

Checks if PHI was properly sanitized by comparing hashes.

## Data Structure

### AIInteraction

```typescript
{
  requestId: string;         // Unique request identifier
  timestamp: string;         // ISO 8601 timestamp
  organization: string;      // Organization ID
  userId: string;            // User ID
  inputHash: string;         // SHA256 of original input
  sanitizedHash: string;     // SHA256 of sanitized input
  phiDetected: string[];     // Types: PERSON, MRN, DATE, etc.
  phiExposed: boolean;       // Always false
  aiProvider: string;        // openai, anthropic, google
  model: string;             // gpt-4, claude-sonnet-4-5
  tokensUsed: number;        // Total tokens used
  costUsd: number;           // Cost in USD
  hipaaCompliant: boolean;   // Compliance status
  processingTimeMs: number;  // Processing time in milliseconds
}
```

## Security

- **No PHI on Blockchain**: Only SHA256 hashes are stored
- **Immutable Records**: Once recorded, interactions cannot be altered
- **Cryptographic Proof**: Different input/sanitized hashes prove PHI sanitization
- **Optional Operation**: Blockchain failures don't break AI requests

## Troubleshooting

### Connection Issues

1. Verify Fabric network is running:

   ```bash
   docker ps | grep fabric
   ```

2. Check wallet directory exists:

   ```bash
   ls blockchain/wallet/
   ```

3. Verify identities are enrolled:
   ```bash
   ls blockchain/wallet/
   # Should show: admin, appUser
   ```

### Chaincode Errors

1. Verify chaincode is deployed:

   ```bash
   # From test-network directory
   docker logs peer0.org1.example.com
   ```

2. Check chaincode name matches:
   - Default: `node2ai`
   - Update `blockchain.service.ts` if different

### Performance

Blockchain operations are asynchronous and non-blocking. If blockchain is unavailable:

- AI requests continue to work normally
- Audit events are silently skipped
- PostgreSQL audit logging remains active

## Production Considerations

For production environments:

1. **Use Production Blockchain**: Don't use test network
2. **Secure Wallet**: Protect `blockchain/wallet/` directory
3. **Monitor Performance**: Track blockchain operation metrics
4. **Backup Crypto Material**: Backup wallet directory securely
5. **Update Connection Profile**: Use production connection profile
6. **Enable RLS**: Configure proper access control policies

## License

Proprietary - Node2AI
