import { randomBytes } from 'node:crypto';
import type { PgQueryable } from '../shared/pg.js';
import { decryptUtf8, encryptUtf8 } from '../shared/crypto.js';
import type { TokenVault, TokenVaultRecord } from './types.js';

/**
 * Postgres-backed token vault. Plaintext is encrypted at rest with GATEWAY_VAULT_KEY.
 */
export class PostgresTokenVault implements TokenVault {
  forceFailure = false;

  constructor(
    private readonly db: PgQueryable,
    private readonly encryptionKey: string,
  ) {}

  async store(
    record: Omit<TokenVaultRecord, 'created_at'> & { created_at?: string },
  ): Promise<void> {
    if (this.forceFailure) {
      throw new Error('Token vault write failed');
    }
    const sealed = encryptUtf8(record.plaintext, this.encryptionKey);
    const tokenId = `tok_${randomBytes(8).toString('hex')}`;
    await this.db.query(
      `INSERT INTO token_vault (token_id, organization_id, token_value, ciphertext, entity_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token_value) DO UPDATE SET
         ciphertext = EXCLUDED.ciphertext,
         entity_type = EXCLUDED.entity_type,
         organization_id = EXCLUDED.organization_id`,
      [
        tokenId,
        record.organization_id,
        record.token,
        Buffer.from(sealed, 'utf8'),
        record.entity_type,
      ],
    );
  }

  async lookup(organizationId: string, token: string): Promise<TokenVaultRecord | null> {
    if (this.forceFailure) {
      throw new Error('Token vault read failed');
    }
    const res = await this.db.query(
      `SELECT token_value, organization_id, entity_type, ciphertext, created_at
       FROM token_vault
       WHERE organization_id = $1 AND token_value = $2`,
      [organizationId, token],
    );
    const row = res.rows[0];
    if (!row) return null;
    const cipher = row.ciphertext;
    const sealed =
      cipher instanceof Buffer
        ? cipher.toString('utf8')
        : typeof cipher === 'string'
          ? cipher
          : Buffer.from(cipher as ArrayBuffer).toString('utf8');
    return {
      token: String(row.token_value),
      organization_id: String(row.organization_id),
      entity_type: String(row.entity_type),
      plaintext: decryptUtf8(sealed, this.encryptionKey),
      request_id: '',
      created_at:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at ?? new Date().toISOString()),
    };
  }
}
