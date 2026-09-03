import { randomBytes } from 'node:crypto';
import { decryptUtf8, encryptUtf8 } from '../shared/crypto.js';
import type { TokenVault, TokenVaultRecord } from './types.js';

export function newTokenValue(entityType: string): string {
  const id = randomBytes(4).toString('hex');
  return `{{TOK_${entityType}_${id}}}`;
}

export class InMemoryTokenVault implements TokenVault {
  private readonly byOrgToken = new Map<string, TokenVaultRecord>();
  forceFailure = false;

  constructor(private readonly encryptionKey?: string) {}

  private key(organizationId: string, token: string): string {
    return `${organizationId}::${token}`;
  }

  private seal(plaintext: string): string {
    if (!this.encryptionKey) return plaintext;
    return encryptUtf8(plaintext, this.encryptionKey);
  }

  private open(stored: string): string {
    if (!this.encryptionKey) return stored;
    return decryptUtf8(stored, this.encryptionKey);
  }

  async store(
    record: Omit<TokenVaultRecord, 'created_at'> & { created_at?: string },
  ): Promise<void> {
    if (this.forceFailure) {
      throw new Error('Token vault write failed');
    }
    const full: TokenVaultRecord = {
      ...record,
      plaintext: this.seal(record.plaintext),
      created_at: record.created_at ?? new Date().toISOString(),
    };
    this.byOrgToken.set(this.key(full.organization_id, full.token), full);
  }

  async lookup(organizationId: string, token: string): Promise<TokenVaultRecord | null> {
    if (this.forceFailure) {
      throw new Error('Token vault read failed');
    }
    const found = this.byOrgToken.get(this.key(organizationId, token));
    if (!found) return null;
    return { ...found, plaintext: this.open(found.plaintext) };
  }

  size(): number {
    return this.byOrgToken.size;
  }
}
