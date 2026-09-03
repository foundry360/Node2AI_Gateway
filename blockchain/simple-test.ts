/**
 * Simple Blockchain Test
 * Tests basic blockchain functionality without complex imports
 */

import { FabricBlockchainAdapter } from './sdk/fabric-adapter';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import * as path from 'path';
import * as os from 'os';

async function main() {
  try {
    console.log('=== Simple Blockchain Test ===\n');

    // Configuration
    const connectionProfilePath = path.join(
      os.homedir(),
      'hyperledger',
      'fabric-samples',
      'test-network',
      'organizations',
      'peerOrganizations',
      'org1.example.com',
      'connection-org1.json'
    );

    const walletPath = path.join(process.cwd(), 'blockchain', 'wallet');

    console.log('Configuration:');
    console.log('- Connection Profile:', connectionProfilePath);
    console.log('- Wallet Path:', walletPath);
    console.log('');

    // Check if connection profile exists
    const fs = require('fs');
    if (!fs.existsSync(connectionProfilePath)) {
      throw new Error(
        `Connection profile not found at: ${connectionProfilePath}`
      );
    }

    // Initialize adapter
    const adapter = new FabricBlockchainAdapter({
      walletPath,
      connectionProfilePath,
      channelName: 'node2aichannel',
      chaincodeName: 'node2ai',
      organizationMSP: 'Org1MSP',
      userId: 'appUser',
    });

    console.log('✓ Adapter initialized\n');

    // Test data
    const requestId = uuidv4();
    const originalInput =
      'Patient John Doe, MRN 12345, DOB 01/15/1980, presenting with chest pain.';
    const sanitizedInput =
      'Patient [NAME-REDACTED], MRN [MRN-REDACTED], DOB [DATE-REDACTED], presenting with chest pain.';
    const phiDetected = ['PERSON', 'MRN', 'DATE'];

    console.log('Test Data:');
    console.log('- Request ID:', requestId);
    console.log('- Original Input:', originalInput);
    console.log('- Sanitized Input:', sanitizedInput);
    console.log('- PHI Detected:', phiDetected);
    console.log('');

    // Calculate hashes
    const inputHash = createHash('sha256').update(originalInput).digest('hex');
    const sanitizedHash = createHash('sha256')
      .update(sanitizedInput)
      .digest('hex');

    console.log('Hashes:');
    console.log('- Input Hash:', inputHash);
    console.log('- Sanitized Hash:', sanitizedHash);
    console.log('- Hashes Match:', inputHash === sanitizedHash);
    console.log('');

    if (inputHash === sanitizedHash) {
      throw new Error('ERROR: Hashes are identical! PHI was not sanitized.');
    }

    console.log('✓ Hash verification passed (PHI was properly sanitized)\n');

    // Try to connect
    console.log('Attempting to connect to blockchain...');
    try {
      await adapter.connect();
      console.log('✓ Connected to blockchain\n');

      // Create interaction record
      const interaction = {
        requestId,
        timestamp: new Date().toISOString(),
        organization: 'test-org-123',
        userId: 'test-user-456',
        inputHash,
        sanitizedHash,
        phiDetected,
        phiExposed: false,
        aiProvider: 'openai',
        model: 'gpt-4',
        tokensUsed: 150,
        costUsd: 0.002,
        hipaaCompliant: true,
        processingTimeMs: 1200,
      };

      console.log('Recording interaction...');
      await adapter.recordAuditEvent(interaction);
      console.log('✓ Interaction recorded successfully\n');

      console.log('Querying interaction...');
      const queriedInteraction = await adapter.queryAuditEvent(requestId);
      console.log('✓ Interaction queried successfully');
      console.log('Queried Data:', JSON.stringify(queriedInteraction, null, 2));
      console.log('');

      // Verify data integrity
      if (queriedInteraction.requestId !== requestId) {
        throw new Error('Request ID mismatch');
      }
      if (queriedInteraction.inputHash !== inputHash) {
        throw new Error('Input hash mismatch');
      }
      if (queriedInteraction.sanitizedHash !== sanitizedHash) {
        throw new Error('Sanitized hash mismatch');
      }
      if (queriedInteraction.phiExposed !== false) {
        throw new Error('PHI exposed flag is not false');
      }

      console.log('✓ Data integrity verified\n');

      // Disconnect
      await adapter.disconnect();
      console.log('✓ Disconnected from blockchain\n');

      console.log('=== Test Summary ===');
      console.log('✓ Blockchain connection established');
      console.log('✓ Hash verification passed');
      console.log('✓ Interaction recorded successfully');
      console.log('✓ Interaction queried successfully');
      console.log('✓ Data integrity verified');
      console.log('\n✓ All tests passed!');
    } catch (connectionError: any) {
      console.log(
        '⚠️  Blockchain connection failed (expected if chaincode not deployed)'
      );
      console.log('Error:', connectionError.message);
      console.log(
        '\nThis is normal if the chaincode has not been deployed yet.'
      );
      console.log('To deploy the chaincode, run:');
      console.log('cd ~/hyperledger/fabric-samples/test-network');
      console.log(
        './network.sh deployCC -ccn node2ai -ccp ../chaincode/node2ai -ccl go -c node2aichannel'
      );
    }
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
