/**
 * Product 1.0 Workstream 7 — production configuration safety.
 */
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/shared/config.js';
import {
  assertStartupConfigSafety,
  evaluateStartupConfigSafety,
  shouldEnforceProductionConfig,
} from '../../src/shared/production-config.js';

describe('production config safety', () => {
  it('defaults remain enterprise + enforce + audit fail-closed', () => {
    const cfg = loadConfig({} as NodeJS.ProcessEnv);
    expect(cfg.policyEngineMode).toBe('enterprise');
    expect(cfg.actorRegistryMode).toBe('enforce');
    expect(cfg.failClosedOnAuditError).toBe(true);
    expect(cfg.allowLegacyEngine).toBe(false);
  });

  it('treats production license / DATABASE_URL as strict unless insecure escape', () => {
    expect(
      shouldEnforceProductionConfig({
        ENIGMA_LICENSE_MODE: 'production',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      shouldEnforceProductionConfig({
        DATABASE_URL: 'postgres://x',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      shouldEnforceProductionConfig({
        ENIGMA_LICENSE_MODE: 'production',
        GATEWAY_ALLOW_INSECURE_CONFIG: 'true',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('refuses actor=off under production license mode', () => {
    const cfg = loadConfig({
      GATEWAY_ACTOR_REGISTRY_MODE: 'off',
      GATEWAY_ADMIN_API_KEY: 'secure_admin_key_abc',
    } as NodeJS.ProcessEnv);
    const issues = evaluateStartupConfigSafety(cfg, {
      ENIGMA_LICENSE_MODE: 'production',
    } as NodeJS.ProcessEnv);
    expect(issues.some((i) => i.code === 'ACTOR_REGISTRY_OFF' && i.severity === 'fatal')).toBe(
      true,
    );
    expect(() =>
      assertStartupConfigSafety(cfg, {
        ENIGMA_LICENSE_MODE: 'production',
      } as NodeJS.ProcessEnv, () => {}),
    ).toThrow(/ACTOR_REGISTRY_OFF/);
  });

  it('refuses audit fail-open under DATABASE_URL appliance posture', () => {
    const cfg = loadConfig({
      GATEWAY_FAIL_CLOSED_AUDIT: 'false',
      GATEWAY_ADMIN_API_KEY: 'secure_admin_key_abc',
    } as NodeJS.ProcessEnv);
    expect(cfg.failClosedOnAuditError).toBe(false);
    expect(() =>
      assertStartupConfigSafety(cfg, {
        DATABASE_URL: 'postgres://local/enigma',
      } as NodeJS.ProcessEnv, () => {}),
    ).toThrow(/AUDIT_FAIL_OPEN/);
  });

  it('refuses default development admin key under production mode', () => {
    const cfg = loadConfig({
      GATEWAY_ADMIN_API_KEY: undefined,
    } as NodeJS.ProcessEnv);
    expect(cfg.adminApiKey).toBe('n2ai_admin_dev_key');
    expect(() =>
      assertStartupConfigSafety(cfg, {
        ENIGMA_LICENSE_MODE: 'production',
      } as NodeJS.ProcessEnv, () => {}),
    ).toThrow(/DEFAULT_ADMIN_KEY/);
  });

  it('allows insecure escape hatch for lab bypass', () => {
    const cfg = loadConfig({
      GATEWAY_ACTOR_REGISTRY_MODE: 'off',
      GATEWAY_FAIL_CLOSED_AUDIT: 'false',
    } as NodeJS.ProcessEnv);
    expect(() =>
      assertStartupConfigSafety(cfg, {
        ENIGMA_LICENSE_MODE: 'production',
        GATEWAY_ALLOW_INSECURE_CONFIG: 'true',
      } as NodeJS.ProcessEnv, () => {}),
    ).not.toThrow();
  });

  it('warns but does not fatal in non-strict local mode', () => {
    const cfg = loadConfig({
      GATEWAY_ACTOR_REGISTRY_MODE: 'off',
    } as NodeJS.ProcessEnv);
    const issues = evaluateStartupConfigSafety(cfg, {} as NodeJS.ProcessEnv);
    expect(issues.find((i) => i.code === 'ACTOR_REGISTRY_OFF')?.severity).toBe(
      'warn',
    );
    expect(() =>
      assertStartupConfigSafety(cfg, {} as NodeJS.ProcessEnv, () => {}),
    ).not.toThrow();
  });
});
