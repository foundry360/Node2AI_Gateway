/**
 * Hyperledger Fabric Admin Enrollment Script
 * Enrolls the organization admin to the CA
 */

import FabricCAServices from 'fabric-ca-client';
import { Wallets } from 'fabric-network';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  try {
    // Path to wallet directory
    const walletPath = path.join(process.cwd(), 'blockchain', 'wallet');

    // Check if wallet directory exists, if not create it
    if (!fs.existsSync(walletPath)) {
      fs.mkdirSync(walletPath, { recursive: true });
      console.log('Created wallet directory');
    }

    // Create a wallet
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    console.log(`Wallet path: ${walletPath}`);

    // Check if admin identity already exists
    const adminExists = await wallet.get('admin');
    if (adminExists) {
      console.log('Admin identity already exists in wallet');
      return;
    }

    // Create a new CA client
    const connectionProfilePath = path.join(
      process.env.HOME || '~',
      'hyperledger',
      'fabric-samples',
      'test-network',
      'organizations',
      'peerOrganizations',
      'org1.example.com',
      'connection-org1.json'
    );

    if (!fs.existsSync(connectionProfilePath)) {
      console.log(
        '⚠️  Connection profile not found at: ' + connectionProfilePath
      );
      console.log(
        "ℹ️  This is expected if you haven't set up the Fabric test network yet."
      );
      console.log('ℹ️  The blockchain integration will work once you:');
      console.log('   1. Set up Hyperledger Fabric test network');
      console.log('   2. Create connection profile at the expected path');
      console.log('   3. Deploy the chaincode');
      console.log('');
      console.log('📚 See BLOCKCHAIN_SETUP_GUIDE.md for instructions');
      process.exit(0);
    }

    const connectionProfile = JSON.parse(
      fs.readFileSync(connectionProfilePath, 'utf8')
    );
    const caURL =
      connectionProfile.certificateAuthorities['ca.org1.example.com'].url;
    const ca = new FabricCAServices(caURL);

    // Create a new file system based wallet for managing identities
    console.log('Enrolling admin...');

    // Enroll the admin user, and import the new identity into the wallet
    const enrollment = await ca.enroll({
      enrollmentID: 'admin',
      enrollmentSecret: 'adminpw',
    });

    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: 'Org1MSP',
      type: 'X.509',
    };

    await wallet.put('admin', x509Identity);
    console.log('Successfully enrolled admin and imported it into the wallet');
  } catch (error) {
    console.error(`Failed to enroll admin: ${error}`);
    process.exit(1);
  }
}

main();
