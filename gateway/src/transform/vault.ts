import { randomBytes } from 'node:crypto';
import type { TokenVault, TokenVaultRecord } from './types.js';

export function newTokenValue(entityType: string): string {
  const id = randomBytes(4).toString('hex');
  return `{{TOK_${entityType}_${id}}}`;
}

export class InMemoryTokenVault implements TokenVault {
  private readonly byOrgToken = new Map<string, TokenVaultRecord>();
  forceFailure = false;

  private key(organizationId: string, token: string): string {
    return `${organizationId}::${token}`;
  }

  async store(
    record: Omit<TokenVaultRecord, 'created_at'> & { created_at?: string },
  ): Promise<void> {
    if (this.forceFailure) {
      throw new Error('Token vault write failed');
    }
    const full: TokenVaultRecord = {
      ...record,
      created_at: record.created_at ?? new Date().toISOString(),
    };
    this.byOrgToken.set(this.key(full.organization_id, full.token), full);
  }

  async lookup(organizationId: string, token: string): Promise<TokenVaultRecord | null> {
    if (this.forceFailure) {
      throw new Error('Token vault read failed');
    }
    return this.byOrgToken.get(this.key(organizationId, token)) ?? null;
  }

  size(): number {
    return this.byOrgToken.size;
  }
}
