/**
 * Encryption utilities for Node2AI
 * Provides secure encryption/decryption for sensitive data like API keys
 */

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const TAG_LENGTH = 16; // 128 bits

/**
 * Generate a random encryption key
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Derive encryption key from password using PBKDF2
 */
export function deriveKey(password: string, salt: string): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt data using AES-256-GCM
 */
export function encrypt(data: string, key: string): string {
  try {
    const keyBuffer = Buffer.from(key, 'hex');
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    cipher.setAAD(Buffer.from('node2ai-provider-key', 'utf8'));

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    // Combine IV + tag + encrypted data
    const combined = Buffer.concat([iv, tag, Buffer.from(encrypted, 'hex')]);
    return combined.toString('base64');
  } catch (error) {
    throw new Error(
      `Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
export function decrypt(encryptedData: string, key: string): string {
  try {
    const keyBuffer = Buffer.from(key, 'hex');
    const combined = Buffer.from(encryptedData, 'base64');

    // Extract IV, tag, and encrypted data
    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAAD(Buffer.from('node2ai-provider-key', 'utf8'));
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, undefined, 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new Error(
      `Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Encrypt provider API key
 */
export function encryptProviderKey(
  apiKey: string,
  encryptionKey: string
): string {
  return encrypt(apiKey, encryptionKey);
}

/**
 * Decrypt provider API key
 */
export function decryptProviderKey(
  encryptedKey: string,
  encryptionKey: string
): string {
  return decrypt(encryptedKey, encryptionKey);
}

/**
 * Generate a secure random string
 */
export function generateSecureRandom(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Hash data using SHA-256
 */
export function hashData(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Verify data against hash
 */
export function verifyHash(data: string, hash: string): boolean {
  return hashData(data) === hash;
}

/**
 * Generate a secure salt
 */
export function generateSalt(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create a secure hash with salt
 */
export function createSecureHash(data: string, salt: string): string {
  return crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha256').toString('hex');
}

/**
 * Verify secure hash
 */
export function verifySecureHash(
  data: string,
  hash: string,
  salt: string
): boolean {
  return createSecureHash(data, salt) === hash;
}
