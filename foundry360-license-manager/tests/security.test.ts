/**
 * Security-oriented unit checks (no private key leakage in helpers).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('security invariants in source', () => {
  it('docker-compose does not embed private key material', () => {
    const compose = readFileSync(
      join(__dirname, '../docker-compose.yml'),
      'utf8',
    );
    expect(compose).not.toMatch(/"d"\s*:/);
    expect(compose).not.toMatch(/BEGIN PRIVATE/);
  });

  it('Dockerfile does not COPY secrets', () => {
    const df = readFileSync(join(__dirname, '../Dockerfile'), 'utf8');
    expect(df).not.toMatch(/secrets/);
    expect(df).not.toMatch(/private\.jwk/);
  });

  it('gitignore excludes private keys and secrets', () => {
    const gi = readFileSync(join(__dirname, '../.gitignore'), 'utf8');
    expect(gi).toMatch(/secrets\/\*/);
    expect(gi).toMatch(/\*\.private\.jwk/);
  });
});
