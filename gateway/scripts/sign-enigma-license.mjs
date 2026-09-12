/**
 * Vendor-side Ed25519 license signing tool (offline).
 *
 * NEVER run inside the customer Gateway container.
 * NEVER embed the private key in source or Docker images.
 *
 * Usage:
 *   ENIGMA_LICENSE_SIGNING_JWK_PATH=$HOME/.enigma-license-signing/enigma-lic-2026-09.private.jwk \
 *   node scripts/sign-enigma-license.mjs \
 *     --claims ./license-claims.json \
 *     --out ./licenses/enigma.license
 *
 * Claims JSON must include license_version, license_id, customer_name,
 * deployment_id, deployment_type, valid_from, valid_until, issued_at,
 * key_id, grace_days.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { SignJWT, importJWK } from 'jose';

function arg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function usage() {
  console.error(`Usage:
  ENIGMA_LICENSE_SIGNING_JWK_PATH=<private-jwk.json> \\
  node scripts/sign-enigma-license.mjs --claims <claims.json> [--out <file>]

Private key must be an Ed25519 OKP JWK including "d".
Public verification keys ship in the Gateway keyring only.`);
  process.exit(1);
}

async function main() {
  const claimsPath = arg('--claims');
  const outPath = arg('--out');
  const keyPath =
    process.env.ENIGMA_LICENSE_SIGNING_JWK_PATH?.trim() || arg('--key');
  if (!claimsPath || !keyPath) usage();

  const claims = JSON.parse(readFileSync(claimsPath, 'utf8'));
  const jwk = JSON.parse(readFileSync(keyPath, 'utf8'));
  if (!jwk.d) {
    console.error('Signing JWK must include private field "d".');
    process.exit(1);
  }
  const keyId = claims.key_id || jwk.kid;
  if (!keyId) {
    console.error('claims.key_id or jwk.kid is required');
    process.exit(1);
  }
  claims.key_id = keyId;

  const key = await importJWK(jwk, 'EdDSA');
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'EdDSA', kid: keyId, typ: 'enigma-license+jwt' })
    .sign(key);

  if (outPath) {
    writeFileSync(outPath, token + '\n', { mode: 0o644 });
    console.log(`Wrote signed license to ${outPath}`);
  } else {
    process.stdout.write(token + '\n');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
