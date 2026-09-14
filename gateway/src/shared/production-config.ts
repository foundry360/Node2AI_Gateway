/**
 * Product 1.0 production configuration safety.
 * Prevents silent unsafe governance posture on production-shaped deployments.
 * Escape hatch: GATEWAY_ALLOW_INSECURE_CONFIG=true (lab/emergency only).
 */

import type { GatewayConfig } from './config.js';

const DEFAULT_DEV_ADMIN_KEY = 'n2ai_admin_dev_key';

export type ConfigSafetyIssue = {
  code: string;
  message: string;
  severity: 'fatal' | 'warn';
};

/**
 * Strict mode applies when the process looks like a production / appliance deploy.
 * Tests and local stub runs without DATABASE_URL / production license remain non-strict.
 */
export function shouldEnforceProductionConfig(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.GATEWAY_ALLOW_INSECURE_CONFIG === 'true') return false;
  const licenseMode = (env.ENIGMA_LICENSE_MODE ?? '').trim().toLowerCase();
  if (licenseMode === 'production' || licenseMode === 'prod') return true;
  if ((env.NODE_ENV ?? '').trim().toLowerCase() === 'production') return true;
  if (env.GATEWAY_REQUIRE_PRODUCTION_CONFIG === 'true') return true;
  if (env.DATABASE_URL && env.DATABASE_URL.trim().length > 0) return true;
  return false;
}

export function evaluateStartupConfigSafety(
  config: GatewayConfig,
  env: NodeJS.ProcessEnv = process.env,
): ConfigSafetyIssue[] {
  const issues: ConfigSafetyIssue[] = [];
  const strict = shouldEnforceProductionConfig(env);

  if (config.actorRegistryMode === 'off') {
    issues.push({
      code: 'ACTOR_REGISTRY_OFF',
      severity: strict ? 'fatal' : 'warn',
      message:
        'GATEWAY_ACTOR_REGISTRY_MODE=off — client Agent/Tool attestation is authoritative. Product 1.0 production requires enforce.',
    });
  } else if (config.actorRegistryMode === 'shadow') {
    issues.push({
      code: 'ACTOR_REGISTRY_SHADOW',
      severity: 'warn',
      message:
        'GATEWAY_ACTOR_REGISTRY_MODE=shadow — server facts are authoritative; client attestation is comparison-only.',
    });
  }

  if (!config.failClosedOnAuditError) {
    issues.push({
      code: 'AUDIT_FAIL_OPEN',
      severity: strict ? 'fatal' : 'warn',
      message:
        'GATEWAY_FAIL_CLOSED_AUDIT=false — audit write failures will not block governed execution. Product 1.0 production requires fail-closed audit.',
    });
  }

  if (
    config.policyEngineMode === 'legacy' ||
    config.policyEngineMode === 'compare'
  ) {
    issues.push({
      code: 'LEGACY_POLICY_ENGINE',
      severity: strict ? 'fatal' : 'warn',
      message: `GATEWAY_POLICY_ENGINE=${config.policyEngineMode} — not Product 1.0 production default. Prefer enterprise.`,
    });
  }

  if (config.allowLegacyEngine) {
    issues.push({
      code: 'LEGACY_ENGINE_ALLOWED',
      severity: 'warn',
      message:
        'GATEWAY_ALLOW_LEGACY_ENGINE=true — legacy/compare modes may be selected. Prefer false in production.',
    });
  }

  if (config.adminApiKey === DEFAULT_DEV_ADMIN_KEY) {
    issues.push({
      code: 'DEFAULT_ADMIN_KEY',
      severity: strict ? 'fatal' : 'warn',
      message:
        'GATEWAY_ADMIN_API_KEY is the built-in development default. Set a unique secret for production.',
    });
  }

  return issues;
}

/**
 * Log warnings; throw if any fatal issues under production-shaped config.
 */
export function assertStartupConfigSafety(
  config: GatewayConfig,
  env: NodeJS.ProcessEnv = process.env,
  log: (msg: string) => void = console.warn,
): void {
  const issues = evaluateStartupConfigSafety(config, env);
  for (const issue of issues) {
    const prefix =
      issue.severity === 'fatal' ? '[enigma] FATAL' : '[enigma] WARNING';
    log(`${prefix}: ${issue.message}`);
  }
  const fatals = issues.filter((i) => i.severity === 'fatal');
  if (fatals.length > 0) {
    throw new Error(
      `Unsafe Enigma production configuration: ${fatals.map((f) => f.code).join(', ')}. ` +
        'Set GATEWAY_ALLOW_INSECURE_CONFIG=true only for explicit lab/emergency bypass.',
    );
  }
}
