/**
 * Generate an Ed25519 license signing keypair for vendor custody.
 *
 * Writes:
 *   - public JWK  (safe to embed in Gateway LICENSE_PUBLIC_KEYRING)
 *   - private JWK (MUST stay outside git / customer images)
 *
 * Usage (from gateway/):
 *   node scripts/generate-license-signing-keypair.mjs \
 *     --kid enigma-lic-2026-09 \
 *     --out-dir "$HOME/.enigma-license-signing"
 *
 * Never commit the private file. Never mount it into customer Compose.
 */

import { generateKeyPair, exportJWK } from 'jose';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

function arg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const kid = arg('--kid') || `enigma-lic-${new Date().toISOString().slice(0, 7)}`;
  const outDir = resolve(
    arg('--out-dir') || join(process.env.HOME || '.', '.enigma-license-signing'),
  );
  mkdirSync(outDir, { recursive: true, mode: 0o700 });

  const privPath = join(outDir, `${kid}.private.jwk`);
  const pubPath = join(outDir, `${kid}.public.jwk`);
  if (existsSync(privPath) && !process.argv.includes('--force')) {
    console.error(`Refusing to overwrite existing ${privPath} (pass --force)`);
    process.exit(1);
  }

  const { privateKey, publicKey } = await generateKeyPair('EdDSA');
  const pub = await exportJWK(publicKey);
  const priv = await exportJWK(privateKey);
  pub.kid = kid;
  pub.alg = 'EdDSA';
  priv.kid = kid;
  priv.alg = 'EdDSA';

  writeFileSync(pubPath, JSON.stringify(pub, null, 2) + '\n', { mode: 0o644 });
  writeFileSync(privPath, JSON.stringify(priv, null, 2) + '\n', { mode: 0o600 });

  console.log(`key_id:     ${kid}`);
  console.log(`public:     ${pubPath}`);
  console.log(`private:    ${privPath}`);
  console.log('');
  console.log('Embed the public JWK in gateway/src/admin/license-keys.ts');
  console.log('Keep the private JWK in vendor secrets / HSM — never commit it.');
  console.log('');
  console.log('Public JWK for keyring:');
  console.log(JSON.stringify(pub, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
