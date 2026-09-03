import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Derive a 32-byte AES key from passphrase or hex material. */
export function deriveVaultKey(material: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(material)) {
    return Buffer.from(material, 'hex');
  }
  return createHash('sha256').update(material, 'utf8').digest();
}

export function encryptUtf8(plaintext: string, keyMaterial: string): string {
  const key = deriveVaultKey(keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptUtf8(payload: string, keyMaterial: string): string {
  if (!payload.startsWith('v1:')) {
    // Legacy plaintext (dev / pre-encryption records)
    return payload;
  }
  const [, ivB64, tagB64, dataB64] = payload.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Invalid vault ciphertext');
  }
  const key = deriveVaultKey(keyMaterial);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}
