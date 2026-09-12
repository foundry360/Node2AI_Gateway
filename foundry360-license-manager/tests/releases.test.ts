import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  assertValidReleaseVersion,
  defaultPackageFileName,
  writeReleaseArtifactFile,
  assertDraftMutable,
} from '../src/lib/releases';
import { releaseCreateSchema } from '../src/lib/validators';

describe('release version validation', () => {
  it('accepts semver-like versions', () => {
    expect(assertValidReleaseVersion('0.1.0')).toBe('0.1.0');
    expect(assertValidReleaseVersion('1.2.3-rc1')).toBe('1.2.3-rc1');
  });

  it('rejects invalid versions', () => {
    expect(() => assertValidReleaseVersion('v1')).toThrow();
    expect(() => assertValidReleaseVersion('')).toThrow();
  });
});

describe('release create schema', () => {
  it('defaults release type to PRODUCTION', () => {
    const parsed = releaseCreateSchema.parse({ version: '0.1.0' });
    expect(parsed.releaseType).toBe('PRODUCTION');
  });
});

describe('package naming', () => {
  it('names vpc and airgap packages from version', () => {
    expect(defaultPackageFileName('0.1.0', 'VPC')).toBe('enigma-0.1.0-vpc.tar.gz');
    expect(defaultPackageFileName('0.1.0', 'AIR_GAPPED')).toBe(
      'enigma-0.1.0-airgap.tar.gz',
    );
  });
});

describe('artifact write + sha256', () => {
  let dir: string;
  const prev = process.env.ARTIFACT_DIR;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'f360-rel-'));
    process.env.ARTIFACT_DIR = dir;
  });

  afterEach(() => {
    process.env.ARTIFACT_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  });

  it('writes file and computes server-side sha256 and size', async () => {
    const payload = Buffer.from('enigma-vpc-package-bytes');
    const expected = createHash('sha256').update(payload).digest('hex');
    const written = await writeReleaseArtifactFile({
      version: '0.1.0',
      fileName: 'enigma-0.1.0-vpc.tar.gz',
      data: payload,
    });
    expect(written.sha256).toBe(expected);
    expect(written.sizeBytes).toBe(payload.length);
    expect(existsSync(written.path)).toBe(true);
    expect(readFileSync(written.path)).toEqual(payload);
    expect(written.path).toContain(join('releases', '0.1.0'));
  });
});

describe('immutability helper', () => {
  it('allows draft mutation only', () => {
    expect(() => assertDraftMutable('DRAFT')).not.toThrow();
    expect(() => assertDraftMutable('APPROVED')).toThrow(/DRAFT/);
    expect(() => assertDraftMutable('DEPRECATED')).toThrow(/DRAFT/);
  });
});

describe('security invariants for release packages', () => {
  it('package names never encode customer or deployment ids', () => {
    const name = defaultPackageFileName('0.1.0', 'VPC');
    expect(name).not.toMatch(/acme|deployment|license|enigma-lic/i);
  });

  it('docs state licenses remain separate', () => {
    const releases = readFileSync(
      join(__dirname, '../docs/RELEASES.md'),
      'utf8',
    );
    expect(releases).toMatch(/never embed/i);
    expect(releases).toMatch(/signed license/i);
  });
});
