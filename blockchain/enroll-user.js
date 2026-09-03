/**
 * Enroll appUser identity for Node2AI blockchain
 */
const { Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const fs = require('fs');
const path = require('path');

async function main() {
  try {
    // Load connection profile
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
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    // Create CA client
    const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
    const caTLSCACerts = caInfo.tlsCACerts.pem;
    const ca = new FabricCAServices(
      caInfo.url,
      { trustedRoots: caTLSCACerts, verify: false },
      caInfo.caName
    );

    // Create wallet
    const walletPath = path.join(__dirname, 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    // Check if appUser already exists
    const userIdentity = await wallet.get('appUser');
    if (userIdentity) {
      console.log('✅ appUser identity already exists in wallet');
      // Remove it so we can re-enroll
      await wallet.remove('appUser');
      console.log('🗑️  Removed old appUser identity');
    }

    // Check admin identity
    const adminIdentity = await wallet.get('admin');
    if (!adminIdentity) {
      console.log('❌ Admin identity not found. Enrolling admin first...');

      // Enroll admin
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
      console.log('✅ Successfully enrolled admin');
    }

    // Get admin from wallet
    const adminId = await wallet.get('admin');
    const provider = wallet.getProviderRegistry().getProvider(adminId.type);
    const adminUser = await provider.getUserContext(adminId, 'admin');

    // Register and enroll appUser
    console.log('📝 Registering appUser...');
    const secret = await ca.register(
      {
        affiliation: 'org1.department1',
        enrollmentID: 'appUser',
        role: 'client',
      },
      adminUser
    );

    console.log('✅ Successfully registered appUser');

    console.log('📝 Enrolling appUser...');
    const enrollment = await ca.enroll({
      enrollmentID: 'appUser',
      enrollmentSecret: secret,
    });

    const x509Identity = {
      credentials: {
        certificate: enrollment.certificate,
        privateKey: enrollment.key.toBytes(),
      },
      mspId: 'Org1MSP',
      type: 'X.509',
    };

    await wallet.put('appUser', x509Identity);
    console.log('✅ Successfully enrolled and imported appUser into wallet');
  } catch (error) {
    console.error(`❌ Failed to enroll appUser: ${error}`);
    if (error.message && error.message.includes('already registered')) {
      console.log(
        'ℹ️  appUser is already registered. Trying to enroll directly...'
      );
      // Just enroll without registering
      try {
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
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
        const caTLSCACerts = caInfo.tlsCACerts.pem;
        const ca = new FabricCAServices(
          caInfo.url,
          { trustedRoots: caTLSCACerts, verify: false },
          caInfo.caName
        );

        const enrollment = await ca.enroll({
          enrollmentID: 'appUser',
          enrollmentSecret: 'appUserpw', // Try default password
        });

        const walletPath = path.join(__dirname, 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const x509Identity = {
          credentials: {
            certificate: enrollment.certificate,
            privateKey: enrollment.key.toBytes(),
          },
          mspId: 'Org1MSP',
          type: 'X.509',
        };

        await wallet.put('appUser', x509Identity);
        console.log(
          '✅ Successfully enrolled appUser with existing registration'
        );
      } catch (enrollError) {
        console.error(
          `❌ Failed to enroll with existing registration: ${enrollError.message}`
        );
        process.exit(1);
      }
    } else {
      process.exit(1);
    }
  }
}

main();
