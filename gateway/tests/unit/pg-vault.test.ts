import { describe, expect, it, vi } from 'vitest';
import { PostgresTokenVault } from '../../src/transform/pg-vault.js';
import type { PgQueryable } from '../../src/shared/pg.js';

describe('PostgresTokenVault', () => {
  it('encrypts on store and decrypts on lookup', async () => {
    let storedCipher: Buffer | null = null;
    const db: PgQueryable = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('INSERT')) {
          storedCipher = params?.[3] as Buffer;
          return { rows: [], rowCount: 1 };
        }
        return {
          rows: [
            {
              token_value: '{{TOK_EMAIL_abcd}}',
              organization_id: 'org_demo',
              entity_type: 'EMAIL',
              ciphertext: storedCipher,
              created_at: new Date('2026-01-01T00:00:00.000Z'),
            },
          ],
          rowCount: 1,
        };
      }),
    };

    const vault = new PostgresTokenVault(db, 'test-vault-key-32bytes-minimum!!');
    await vault.store({
      token: '{{TOK_EMAIL_abcd}}',
      organization_id: 'org_demo',
      entity_type: 'EMAIL',
      plaintext: 'a@example.com',
      request_id: 'req_1',
    });

    expect(storedCipher).toBeInstanceOf(Buffer);
    expect(storedCipher!.toString('utf8')).not.toContain('a@example.com');

    const found = await vault.lookup('org_demo', '{{TOK_EMAIL_abcd}}');
    expect(found?.plaintext).toBe('a@example.com');
    expect(found?.entity_type).toBe('EMAIL');
  });
});
