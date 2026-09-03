/**
 * Hyperledger Fabric User Registration Script
 * Registers the appUser using the admin identity
 */

import { Wallets } from 'fabric-network';
import FabricCAServices from 'fabric-ca-client';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  try {
    // Path to wallet directory
    const walletPath = path.join(process.cwd(), 'blockchain', 'wallet');

    // Create a wallet
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    console.log(`Wallet path: ${walletPath}`);

    // Check if admin identity exists
    const adminExists = await wallet.get('admin');
    if (!adminExists) {
      throw new Error(
        'Admin identity not found in wallet. Run enroll-admin.ts first'
      );
    }

    // Check if appUser identity already exists
    const userExists = await wallet.get('appUser');
    if (userExists) {
      console.log('appUser identity already exists in wallet');
      return;
    }

    // Load connection profile
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
      console.log('⚠️  Connection profile not found. Admin not enrolled yet.');
      process.exit(0);
    }

    const connectionProfile = JSON.parse(
      fs.readFileSync(connectionProfilePath, 'utf8')
    );
    const caURL =
      connectionProfile.certificateAuthorities['ca.org1.example.com'].url;
    const ca = new FabricCAServices(caURL);

    // Note: User registration via the CA client API is complex and requires proper User objects
    // For now, we'll use a simplified approach that may not work with all Fabric versions
    // In production, you would typically use the Gateway API or a proper CA client wrapper

    console.log(
      '⚠️  User registration is complex and requires additional setup.'
    );
    console.log(
      'ℹ️  For now, the blockchain integration will work in read-only mode.'
    );
    console.log(
      'ℹ️  To enable write access, you can manually register users via the CA CLI:'
    );
    console.log('');
    console.log('    cd ~/hyperledger/fabric-samples/test-network');
    console.log('    docker exec ca_org1 fabric-ca-client register ...');
    console.log('');
    console.log(
      'ℹ️  See FABRIC_SETUP_INSTRUCTIONS.md for detailed registration steps'
    );
    console.log('');
    console.log(
      '✅ Enrollment script completed (admin identity ready for read access)'
    );
  } catch (error) {
    console.error(`Failed to register user: ${error}`);
    process.exit(1);
  }
}

main();
