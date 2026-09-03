/**
 * Hyperledger Fabric User Registration Script (Improved)
 * Registers and enrolls the appUser using the admin identity
 */

import { Wallets, Gateway } from 'fabric-network';
import FabricCAServices from 'fabric-ca-client';
import * as path from 'path';
import * as fs from 'fs';

async function main() {
  try {
    // Get configuration from environment
    const walletPath =
      process.env.BLOCKCHAIN_WALLET_PATH ||
      path.join(process.cwd(), '..', 'blockchain', 'wallet');

    const connectionProfilePath =
      process.env.BLOCKCHAIN_CONNECTION_PROFILE ||
      process.env.FABRIC_CONNECTION_PROFILE ||
      path.join(
        process.env.HOME || '~',
        'hyperledger',
        'fabric-samples',
        'test-network',
        'organizations',
        'peerOrganizations',
        'org1.example.com',
        'connection-org1.json'
      );

    const userId = process.env.BLOCKCHAIN_USER_ID || 'appUser';
    const userSecret = process.env.BLOCKCHAIN_USER_SECRET || 'appUserpw';

    console.log(`Wallet path: ${walletPath}`);
    console.log(`Connection profile: ${connectionProfilePath}`);
    console.log(`User ID: ${userId}`);

    // Check if wallet directory exists, if not create it
    if (!fs.existsSync(walletPath)) {
      fs.mkdirSync(walletPath, { recursive: true });
      console.log('Created wallet directory');
    }

    // Create a wallet
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    // Check if admin identity exists
    const adminExists = await wallet.get('admin');
    if (!adminExists) {
      throw new Error(
        'Admin identity not found in wallet. Run enroll-admin.ts first'
      );
    }

    // Check if user identity already exists
    const userExists = await wallet.get(userId);
    if (userExists) {
      console.log(`User identity "${userId}" already exists in wallet`);
      console.log('Skipping registration...');
      return;
    }

    // Load connection profile
    if (!fs.existsSync(connectionProfilePath)) {
      console.log(
        '⚠️  Connection profile not found at: ' + connectionProfilePath
      );
      console.log(
        'ℹ️  Please set BLOCKCHAIN_CONNECTION_PROFILE environment variable'
      );
      process.exit(1);
    }

    const connectionProfile = JSON.parse(
      fs.readFileSync(connectionProfilePath, 'utf8')
    );

    // Get CA URL from connection profile
    const caURL =
      connectionProfile.certificateAuthorities['ca.org1.example.com']?.url ||
      connectionProfile.certificateAuthorities['ca_org1']?.url;

    if (!caURL) {
      throw new Error('CA URL not found in connection profile');
    }

    // Create CA client
    const caInfo =
      connectionProfile.certificateAuthorities['ca.org1.example.com'] ||
      connectionProfile.certificateAuthorities['ca_org1'];

    if (!caInfo) {
      throw new Error('CA info not found in connection profile');
    }

    const caService = new FabricCAServices(caInfo.url, {
      trustedRoots: caInfo.tlsCACerts.pem,
      verify: false, // Set to true in production with proper certificates
    });

    // Register user with CA
    console.log(`Registering user "${userId}" with CA...`);

    try {
      const adminIdentity = await wallet.get('admin');
      if (!adminIdentity) {
        throw new Error('Admin identity missing from wallet');
      }

      const provider = wallet
        .getProviderRegistry()
        .getProvider(adminIdentity.type);
      const adminUser = await provider.getUserContext(adminIdentity, 'admin');

      const secret = await caService.register(
        {
          enrollmentID: userId,
          enrollmentSecret: userSecret,
          role: 'client',
          affiliation: 'org1.department1',
        },
        adminUser
      );

      console.log(`Successfully registered user "${userId}"`);
      console.log(`Enrollment secret: ${secret}`);

      // Enroll user
      console.log(`Enrolling user "${userId}"...`);
      const enrollment = await caService.enroll({
        enrollmentID: userId,
        enrollmentSecret: secret || userSecret,
      });

      // Create X.509 identity
      const x509Identity = {
        credentials: {
          certificate: enrollment.certificate,
          privateKey: enrollment.key.toBytes(),
        },
        mspId: 'Org1MSP',
        type: 'X.509',
      };

      // Import identity into wallet
      await wallet.put(userId, x509Identity);
      console.log(
        `Successfully enrolled and imported user "${userId}" into wallet`
      );
    } catch (registerError: any) {
      // If registration fails, try alternative method
      if (registerError.message?.includes('already registered')) {
        console.log(
          `User "${userId}" is already registered. Attempting enrollment...`
        );

        // Try to enroll with existing registration
        const enrollment = await caService.enroll({
          enrollmentID: userId,
          enrollmentSecret: userSecret,
        });

        const x509Identity = {
          credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
          },
          mspId: 'Org1MSP',
          type: 'X.509',
        };

        await wallet.put(userId, x509Identity);
        console.log(`Successfully enrolled existing user "${userId}"`);
      } else {
        throw registerError;
      }
    }

    console.log('✅ User registration completed successfully');
  } catch (error: any) {
    console.error(`❌ Failed to register user: ${error.message}`);
    console.error(error);

    // Provide helpful error messages
    if (error.message?.includes('Admin identity')) {
      console.log('\n💡 Run the admin enrollment script first:');
      console.log('   node -r ts-node/register sdk/enroll-admin.ts');
    } else if (error.message?.includes('Connection profile')) {
      console.log('\n💡 Set the connection profile path:');
      console.log(
        '   export BLOCKCHAIN_CONNECTION_PROFILE=/path/to/connection-profile.json'
      );
    }

    process.exit(1);
  }
}

main();
