#!/usr/bin/env ts-node
/**
 * License Key Generation Script
 * Generates RSA key pairs for signing and verifying licenses
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

interface KeyPair {
  publicKey: string;
  privateKey: string;
}

/**
 * Generate RSA key pair
 */
function generateKeyPair(): KeyPair {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  return { publicKey, privateKey };
}

/**
 * Format key for environment variable (single line)
 */
function formatForEnv(key: string): string {
  return key
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('---'))
    .join('\\n');
}

/**
 * Main execution
 */
function main() {
  console.log('🔑 Generating RSA key pair for license signing...\n');

  // Generate keys
  const { publicKey, privateKey } = generateKeyPair();

  // Format for environment variables
  const publicKeyEnv = formatForEnv(publicKey);
  const privateKeyEnv = formatForEnv(privateKey);

  // Display keys
  console.log('✅ Keys generated successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 LICENSE_PUBLIC_KEY (add to your .env file):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(publicKeyEnv);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔒 LICENSE_PRIVATE_KEY (add to your .env file):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(privateKeyEnv);
  console.log('\n');

  // Optional: Save to files (for development only)
  if (process.argv.includes('--save')) {
    const keysDir = path.join(process.cwd(), 'keys');

    if (!fs.existsSync(keysDir)) {
      fs.mkdirSync(keysDir, { recursive: true });
      console.log('📁 Created keys directory');
    }

    const publicKeyPath = path.join(keysDir, 'license-public.pem');
    const privateKeyPath = path.join(keysDir, 'license-private.pem');

    fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
    fs.writeFileSync(privateKeyPath, privateKey, { mode: 0o600 });

    console.log(`✅ Saved public key to: ${publicKeyPath}`);
    console.log(`✅ Saved private key to: ${privateKeyPath}`);
    console.log(
      '\n⚠️  IMPORTANT: Keep private key secure! Add keys/ to .gitignore\n'
    );
  }

  // Create .env addition
  const envAddition = `\n# License Signing Keys (generated ${new Date().toISOString()})
LICENSE_PUBLIC_KEY="${publicKeyEnv}"
LICENSE_PRIVATE_KEY="${privateKeyEnv}"`;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📝 Add these to your .env file:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(envAddition);
  console.log('\n');

  // Security warnings
  console.log('⚠️  SECURITY WARNINGS:');
  console.log('   1. NEVER commit private key to version control');
  console.log('   2. Store private key in secure key management system');
  console.log(
    '   3. Use environment variables or secrets manager in production'
  );
  console.log('   4. Rotate keys periodically (every 90-180 days)\n');
}

// Run
main();
