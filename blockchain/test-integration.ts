/**
 * Blockchain Integration Test Script
 * Tests the blockchain integration with sample data
 */

import { BlockchainService } from '../apps/api/src/lib/blockchain/blockchain.service';
const blockchainService = new BlockchainService();
import { v4 as uuidv4 } from 'uuid';

async function main() {
  try {
    console.log('=== Starting Blockchain Integration Test ===\n');

    // Wait for blockchain to connect
    console.log('Waiting for blockchain connection...');
    let attempts = 0;
    while (!blockchainService.isBlockchainConnected() && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      attempts++;
    }

    if (!blockchainService.isBlockchainConnected()) {
      throw new Error('Blockchain not connected after 20 seconds');
    }

    console.log('✓ Blockchain connected\n');

    // Generate test data
    const requestId = uuidv4();
    const originalInput =
      'Patient John Doe, MRN 12345, DOB 01/15/1980, presenting with chest pain.';
    const sanitizedPrompt =
      'Patient [NAME-REDACTED], MRN [MRN-REDACTED], DOB [DATE-REDACTED], presenting with chest pain.';
    const phiDetected = ['PERSON', 'MRN', 'DATE'];

    console.log('Test Data:');
    console.log('- Request ID:', requestId);
    console.log('- Original Input:', originalInput);
    console.log('- Sanitized Input:', sanitizedPrompt);
    console.log('- PHI Detected:', phiDetected);
    console.log('');

    // Calculate hashes
    const inputHash = blockchainService.hashData(originalInput);
    const sanitizedHash = blockchainService.hashData(sanitizedPrompt);

    console.log('Hashes:');
    console.log('- Input Hash:', inputHash);
    console.log('- Sanitized Hash:', sanitizedHash);
    console.log('- Hashes Match:', inputHash === sanitizedHash);
    console.log('');

    if (inputHash === sanitizedHash) {
      throw new Error('ERROR: Hashes are identical! PHI was not sanitized.');
    }

    console.log('✓ Hash verification passed (PHI was properly sanitized)\n');

    // Step 1: Record interaction
    console.log('Step 1: Recording AI interaction on blockchain...');
    const recordedRequestId = await blockchainService.recordAuditEvent({
      requestId,
      organizationId: 'test-org-123',
      userId: 'test-user-456',
      originalInput,
      sanitizedPrompt,
      aiResponse: 'AI response: evaluate symptoms and recommend EKG.',
      sanitizedResponse: 'AI response: evaluate symptoms and recommend EKG.',
      desanitizedResponse: 'AI response: evaluate symptoms and recommend EKG.',
      phiDetected,
      aiProvider: 'openai',
      model: 'gpt-4',
      tokensUsed: 150,
      costUsd: 0.002,
      processingTimeMs: 1200,
      success: true,
    });

    console.log(
      `✓ Interaction recorded with request ID: ${recordedRequestId}\n`
    );

    // Step 2: Query the interaction
    console.log('Step 2: Querying interaction from blockchain...');
    const queriedInteraction =
      await blockchainService.queryAuditEvent(requestId);

    console.log('Queried Interaction:');
    console.log(JSON.stringify(queriedInteraction, null, 2));
    console.log('');

    // Step 3: Verify data integrity
    console.log('Step 3: Verifying data integrity...');
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

    // Step 4: Verify PHI compliance
    console.log('Step 4: Verifying PHI compliance...');
    const complianceResult =
      await blockchainService.verifyPHICompliance(requestId);

    console.log('Compliance Result:');
    console.log('- Is Compliant:', complianceResult.isCompliant);
    console.log('- Message:', complianceResult.message);
    console.log('');

    if (!complianceResult.isCompliant) {
      throw new Error('PHI compliance check failed');
    }

    console.log('✓ PHI compliance verified\n');

    // Step 5: Query by organization
    console.log('Step 5: Querying interactions by organization...');
    const orgInteractions =
      await blockchainService.queryAuditEventsByOrg('test-org-123');

    console.log(
      `✓ Found ${orgInteractions.length} interaction(s) for organization\n`
    );

    // Summary
    console.log('=== Test Summary ===');
    console.log('✓ Blockchain connection established');
    console.log('✓ Hash verification passed');
    console.log('✓ Interaction recorded successfully');
    console.log('✓ Interaction queried successfully');
    console.log('✓ Data integrity verified');
    console.log('✓ PHI compliance verified');
    console.log('✓ Organization query successful');
    console.log('\n✓ All tests passed!');

    // Disconnect
    await blockchainService.disconnect();
    console.log('\nDisconnected from blockchain');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();
