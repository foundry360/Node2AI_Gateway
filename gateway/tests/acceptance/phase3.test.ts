import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  FailingTransformService,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  InputTransformService,
  InMemoryTokenVault,
  PrivilegedDetokenizationService,
} from '../../src/transform/index.js';

describe('Phase 3 acceptance — Input Enforcement', () => {
  it('Sensitive request → Policy TOKENIZE → Transform → Model', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [
        {
          role: 'user',
          content: 'Email alice@example.org about the schedule',
        },
      ],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    if (result.body.status === 'approved') {
      const content = result.body.response.message.content;
      expect(content).toMatch(/\{\{TOK_EMAIL_[a-f0-9]+\}\}/);
      expect(content).not.toContain('alice@example.org');
    }

    expect(gw.vault.size()).toBeGreaterThan(0);
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.input_transformation).toBe('tokenize');
    expect(last.policy_decision).toBe('TOKENIZE');
  });

  it('Test 4 — Transform failure fails closed (BLOCK)', async () => {
    const gw = createPhase1Gateway({
      transform: new FailingTransformService(),
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [
        {
          role: 'user',
          content: 'Reach me at bob@example.com',
        },
      ],
    });

    expect(result.httpStatus).toBe(403);
    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('TRANSFORM_FAILURE');
    }
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.model_selected).toBeUndefined();
  });

  it('Unauthorized detokenization leaves tokens intact', async () => {
    const vault = new InMemoryTokenVault();
    const transform = new InputTransformService(vault);
    const detok = new PrivilegedDetokenizationService(vault);

    const applied = await transform.apply({
      organization_id: 'org_demo',
      request_id: 'req_test',
      correlation_id: 'corr_test',
      text: 'Contact carol@example.com',
      entities: [
        {
          type: 'EMAIL',
          preview: 'ca…om',
          start: 8,
          end: 25,
          source: 'deterministic',
        },
      ],
      decision: 'TOKENIZE',
      transforms: [{ type: 'tokenize', targets: ['PII'] }],
    });

    expect(applied.transformed_text).toContain('{{TOK_EMAIL_');
    expect(applied.transformed_text).not.toContain('carol@example.com');

    const denied = await detok.detokenize({
      organization_id: 'org_demo',
      text: applied.transformed_text,
      authorized: false,
    });
    expect(denied.restored).toBe(0);
    expect(denied.text).toBe(applied.transformed_text);

    const allowed = await detok.detokenize({
      organization_id: 'org_demo',
      text: applied.transformed_text,
      authorized: true,
    });
    expect(allowed.restored).toBe(1);
    expect(allowed.text).toContain('carol@example.com');
  });

  it('Vault write failure during tokenize fails closed', async () => {
    const vault = new InMemoryTokenVault();
    vault.forceFailure = true;
    const gw = createPhase1Gateway({
      transform: new InputTransformService(vault),
    });

    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Mail dana@example.com' }],
    });

    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('TRANSFORM_FAILURE');
    }
  });
});
