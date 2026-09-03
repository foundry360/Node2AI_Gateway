/**
 * Import admin identity from cryptogen certificates
 */
const { Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // Path to crypto materials
    const credPath = path.join(
      process.env.HOME,
      'hyperledger',
      'fabric-samples',
      'test-network',
      'organizations',
      'peerOrganizations',
      'org1.example.com'
    );

    // Read certificate
    const signcertsPath = path.join(
      credPath,
      'users',
      'Admin@org1.example.com',
      'msp',
      'signcerts'
    );
    const certFiles = fs.readdirSync(signcertsPath);
    const certPath = path.join(signcertsPath, certFiles[0]);
    const certificate = fs.readFileSync(certPath).toString();

    // Read private key
    const keyPath = path.join(
      credPath,
      'users',
      'Admin@org1.example.com',
      'msp',
      'keystore'
    );
    const keyFiles = fs.readdirSync(keyPath);
    const privateKey = fs
      .readFileSync(path.join(keyPath, keyFiles[0]))
      .toString();

    // Create identity
    const identity = {
      credentials: {
        certificate,
        privateKey,
      },
      mspId: 'Org1MSP',
      type: 'X.509',
    };

    // Create wallet and import
    const walletPath = path.join(__dirname, 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    await wallet.put('appUser', identity);

    console.log('✅ Successfully imported admin credentials as appUser');
    console.log('  Certificate:', certPath);
    console.log('  Private Key:', path.join(keyPath, keyFiles[0]));
  } catch (error) {
    console.error(`❌ Failed to import admin: ${error}`);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
