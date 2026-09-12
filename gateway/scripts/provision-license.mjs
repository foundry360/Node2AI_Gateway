/**
 * Foundry360 vendor-side license provisioning wrapper.
 *
 * Orchestrates claim assembly + the existing sign-enigma-license.mjs tool.
 * NOT a new licensing engine. Run ONLY in the Foundry360 vendor environment.
 *
 * NEVER run inside the customer Gateway container or customer VPC.
 * NEVER embed or print the private signing key.
 *
 * Usage (from gateway/):
 *   ENIGMA_LICENSE_SIGNING_JWK_PATH=$HOME/.enigma-license-signing/enigma-lic-2026-09.private.jwk \
 *   node scripts/provision-license.mjs \
 *     --customer "Acme Health" \
 *     --license-id "ENIGMA-ACME-001" \
 *     --deployment-id "7b4f9e2a-...." \
 *     --deployment-type "vpc" \
 *     --valid-from "2026-10-01" \
 *     --valid-until "2027-09-30" \
 *     --grace-days 30 \
 *     --output "./enigma.license"
 */

import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIGN_SCRIPT = join(__dirname, 'sign-enigma-license.mjs');
const DEFAULT_KEY_ID = 'enigma-lic-2026-09';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function arg(argv, name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

function usage(exitCode = 1) {
  console.error(`Foundry360 license provisioning (vendor-side only)

Usage:
  ENIGMA_LICENSE_SIGNING_JWK_PATH=<private-jwk.json> \\
  node scripts/provision-license.mjs \\
    --customer <name> \\
    --license-id <ENIGMA-...> \\
    --deployment-id <uuid> \\
    --deployment-type vpc|air_gapped \\
    --valid-from YYYY-MM-DD \\
    --valid-until YYYY-MM-DD \\
    [--grace-days 30] \\
    [--key-id enigma-lic-2026-09] \\
    --output <path>

Retrieves nothing from the customer VPC. Pass deployment_id from:
  GET /v1/admin/system → deployment.deployment_id`);
  process.exit(exitCode);
}

function parseDeploymentType(raw) {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (v === 'vpc') return 'vpc';
  if (v === 'air_gapped' || v === 'airgapped' || v === 'airgap') return 'air_gapped';
  return null;
}

function assertDateOnly(label, value) {
  if (!DATE_ONLY.test(String(value ?? '').trim())) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
  return String(value).trim();
}

/**
 * Build Phase 2 license claims from Foundry360 provisioning inputs.
 * Pure — safe to unit test without private keys.
 */
export function buildLicenseClaims(input) {
  const customer_name = String(input.customer_name ?? '').trim();
  const license_id = String(input.license_id ?? '').trim();
  const deployment_id = String(input.deployment_id ?? '').trim();
  const deployment_type = parseDeploymentType(input.deployment_type);
  const valid_from = assertDateOnly('valid_from', input.valid_from);
  const valid_until = assertDateOnly('valid_until', input.valid_until);
  const grace_days = Number(input.grace_days ?? 30);
  const key_id = String(input.key_id ?? DEFAULT_KEY_ID).trim();

  if (!customer_name) throw new Error('customer_name is required');
  if (!license_id) throw new Error('license_id is required');
  if (!UUID_RE.test(deployment_id)) {
    throw new Error('deployment_id must be a UUID from the customer installation');
  }
  if (!deployment_type) {
    throw new Error('deployment_type must be vpc or air_gapped');
  }
  if (!Number.isInteger(grace_days) || grace_days < 0 || grace_days > 3650) {
    throw new Error('grace_days must be an integer 0–3650');
  }
  if (!key_id) throw new Error('key_id is required');

  const issued_at =
    input.issued_at?.trim() || new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  return {
    license_version: 1,
    license_id,
    customer_name,
    deployment_id,
    deployment_type,
    valid_from,
    valid_until,
    issued_at,
    key_id,
    grace_days,
  };
}

/**
 * Assemble claims and invoke sign-enigma-license.mjs (existing signing tool).
 */
export function provisionSignedLicense(opts) {
  const claims = buildLicenseClaims(opts);
  const outputPath = resolve(String(opts.output_path ?? '').trim());
  if (!outputPath) throw new Error('output_path is required');

  const keyPath =
    opts.signing_jwk_path?.trim() ||
    process.env.ENIGMA_LICENSE_SIGNING_JWK_PATH?.trim() ||
    '';
  if (!keyPath) {
    throw new Error(
      'ENIGMA_LICENSE_SIGNING_JWK_PATH (or signing_jwk_path) is required',
    );
  }

  // Defense: never accept writing into a path that looks like a private key file.
  if (/\.private\.jwk$/i.test(outputPath)) {
    throw new Error('output_path must not be a private JWK path');
  }

  const tmp = mkdtempSync(join(tmpdir(), 'enigma-provision-'));
  const claimsPath = join(tmp, 'claims.json');
  try {
    writeFileSync(claimsPath, JSON.stringify(claims, null, 2) + '\n', {
      mode: 0o600,
    });

    const result = spawnSync(
      process.execPath,
      [SIGN_SCRIPT, '--claims', claimsPath, '--out', outputPath, '--key', keyPath],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          ENIGMA_LICENSE_SIGNING_JWK_PATH: keyPath,
        },
      },
    );

    if (result.status !== 0) {
      const err = (result.stderr || result.stdout || 'sign failed').trim();
      throw new Error(`sign-enigma-license failed: ${err}`);
    }

    const token = readFileSync(outputPath, 'utf8').trim();
    if (!token || token.split('.').length !== 3) {
      throw new Error('signed license output is not a compact JWS');
    }
    // Never echo private key material — only confirm path + public claim ids.
    return {
      output_path: outputPath,
      license_id: claims.license_id,
      deployment_id: claims.deployment_id,
      key_id: claims.key_id,
      valid_from: claims.valid_from,
      valid_until: claims.valid_until,
      grace_days: claims.grace_days,
      deployment_type: claims.deployment_type,
      token_preview: `${token.slice(0, 16)}…`,
    };
  } finally {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function main(argv = process.argv) {
  if (argv.includes('--help') || argv.includes('-h')) usage(0);

  const customer = arg(argv, '--customer');
  const licenseId = arg(argv, '--license-id');
  const deploymentId = arg(argv, '--deployment-id');
  const deploymentType = arg(argv, '--deployment-type');
  const validFrom = arg(argv, '--valid-from');
  const validUntil = arg(argv, '--valid-until');
  const graceDays = arg(argv, '--grace-days');
  const keyId = arg(argv, '--key-id');
  const output = arg(argv, '--output') || arg(argv, '--out');

  if (
    !customer ||
    !licenseId ||
    !deploymentId ||
    !deploymentType ||
    !validFrom ||
    !validUntil ||
    !output
  ) {
    usage(1);
  }

  try {
    const summary = provisionSignedLicense({
      customer_name: customer,
      license_id: licenseId,
      deployment_id: deploymentId,
      deployment_type: deploymentType,
      valid_from: validFrom,
      valid_until: validUntil,
      grace_days: graceDays === null ? 30 : Number(graceDays),
      key_id: keyId || DEFAULT_KEY_ID,
      output_path: output,
    });
    console.log('Provisioned signed license (Foundry360 vendor-side)');
    console.log(`  output:         ${summary.output_path}`);
    console.log(`  license_id:     ${summary.license_id}`);
    console.log(`  deployment_id:  ${summary.deployment_id}`);
    console.log(`  deployment_type:${summary.deployment_type}`);
    console.log(`  valid_from:     ${summary.valid_from}`);
    console.log(`  valid_until:    ${summary.valid_until}`);
    console.log(`  grace_days:     ${summary.grace_days}`);
    console.log(`  key_id:         ${summary.key_id}`);
    console.log('');
    console.log(
      'Next: copy the file to the customer host ./licenses/enigma.license, restart Gateway, verify license.status=ACTIVE via GET /v1/admin/system.',
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

const isDirect =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  main();
}
