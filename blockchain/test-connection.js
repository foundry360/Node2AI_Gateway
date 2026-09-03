/**
 * Test Fabric SDK connection directly
 */
const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    console.log('🔗 Testing Fabric SDK Connection...\n');

    // Paths
    const ccpPath = path.resolve(
      process.env.HOME,
      'hyperledger',
      'fabric-samples',
      'test-network',
      'organizations',
      'peerOrganizations',
      'org1.example.com',
      'connection-org1.json'
    );
    const walletPath = path.join(__dirname, 'wallet');

    console.log('📁 Connection Profile:', ccpPath);
    console.log('📁 Wallet Path:', walletPath);

    // Load connection profile
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
    console.log('\n✅ Loaded connection profile');

    // Load wallet
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    const identity = await wallet.get('appUser');

    if (!identity) {
      throw new Error('appUser identity not found in wallet');
    }

    console.log('✅ Found appUser identity (MSP:', identity.mspId, ')');

    // Create gateway
    const gateway = new Gateway();

    console.log('\n🔌 Connecting to gateway...');
    await gateway.connect(ccp, {
      wallet,
      identity: 'appUser',
      discovery: { enabled: false, asLocalhost: true },
    });

    console.log('✅ Connected to gateway');

    // Get network
    console.log('\n📡 Getting network: node2aichannel');
    const network = await gateway.getNetwork('node2aichannel');
    console.log('✅ Got network');

    // Get contract
    console.log('\n📄 Getting contract: node2ai');
    const contract = network.getContract('node2ai');
    console.log('✅ Got contract');

    // Try to submit a transaction
    console.log('\n📝 Submitting test transaction...');
    const testData = {
      requestId: 'test-' + Date.now(),
      timestamp: new Date().toISOString(),
      organization: 'Org1MSP',
      userId: 'test-user',
      inputHash: 'test-hash-' + Date.now(),
      sanitizedHash: 'sanitized-hash-' + Date.now(),
      phiDetected: [],
      phiExposed: false,
      aiProvider: 'test',
      model: 'test-model',
      tokensUsed: 100,
      costUsd: 0.001,
      hipaaCompliant: true,
      processingTimeMs: 100,
      createdAt: new Date().toISOString(),
    };

    const result = await contract.submitTransaction(
      'RecordInteraction',
      testData.requestId,
      JSON.stringify(testData)
    );

    console.log('✅ Transaction submitted successfully!');
    console.log('📦 Result:', result.toString());

    // Try to query it back
    console.log('\n🔍 Querying transaction...');
    const queryResult = await contract.evaluateTransaction(
      'QueryInteraction',
      testData.requestId
    );

    console.log('✅ Query successful!');
    console.log('📦 Data:', JSON.parse(queryResult.toString()));

    // Disconnect
    gateway.disconnect();
    console.log('\n✅ Test completed successfully!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\nFull error:', error);

    if (error.endorsements) {
      console.error('\n❌ Endorsement errors:');
      error.endorsements.forEach((e, i) => {
        console.error(`  Peer ${i}:`, e.message || e);
      });
    }

    if (error.errors) {
      console.error('\n❌ Peer errors:');
      error.errors.forEach((e, i) => {
        console.error(`  Error ${i}:`, e.message || e);
      });
    }

    process.exit(1);
  }
}

main();
