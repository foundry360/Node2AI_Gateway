import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  FailingDataInterrogator,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';

describe('Phase 2 acceptance — Data Interrogation', () => {
  it('Request → Interrogation → Policy → ALLOW for non-sensitive content', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.data_classification).toBe('Internal');
    expect(last.policy_decision).toBe('ALLOW');
  });

  it('Test 3a — PII enters request → policy TOKENIZE → transform → model (no raw PII)', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [
        {
          role: 'user',
          content: 'Summarize notes for jane.doe@example.com and SSN 123-45-6789',
        },
      ],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    if (result.body.status === 'approved') {
      expect(result.body.response.message.content).toContain('{{TOK_');
      expect(result.body.response.message.content).not.toContain('jane.doe@example.com');
      expect(result.body.response.message.content).not.toContain('123-45-6789');
    }

    const last = (await gw.audit.list()).at(-1)!;
    expect(last.data_classification).toBe('PII');
    expect(last.policy_decision).toBe('TOKENIZE');
    expect(last.input_transformation).toBe('tokenize');
    expect(last.model_selected).toBe('local-general-v1');
  });

  it('Test 3b — PHI to public cloud model → BLOCK', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      messages: [
        {
          role: 'user',
          content: 'Clinical note MRN: A1234567 patient presents with fever',
        },
      ],
    });

    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('PHI_PUBLIC_CLOUD_BLOCKED');
    }
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.data_classification).toBe('PHI');
  });

  it('Test 3c — PHI to approved local clinical path → request ALLOW (clean model output RELEASE)', async () => {
    const { DefaultModelGateway, InMemoryModelRegistry, ScriptedModelProvider } =
      await import('../../src/models/index.js');
    const provider = new ScriptedModelProvider(
      ['local-general-v1'],
      'Summary: continue supportive care and follow up as scheduled.',
      { providerId: 'local-runtime' },
    );
    const registry = new InMemoryModelRegistry([
      {
        model_id: 'local-general-v1',
        provider_id: 'local-runtime',
        name: 'Local',
        kind: 'local',
        status: 'active',
      },
    ]);
    const gw = createPhase1Gateway({
      providers: [provider],
      models: new DefaultModelGateway(registry, [provider]),
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [
        {
          role: 'user',
          content: 'Clinical note MRN: A1234567 patient presents with fever',
        },
      ],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.data_classification).toBe('PHI');
    expect(last.policy_decision).toBe('ALLOW');
    expect(last.response_decision).toBe('RELEASE');
    expect(last.model_selected).toBe('local-general-v1');
  });

  it('PHI on non-clinical application → BLOCK', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions('n2ai_test_key_limited_app', {
      application_id: 'app_limited',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [
        {
          role: 'user',
          content: 'Clinical note MRN: B999 patient presents with cough',
        },
      ],
    });

    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('PHI_APPLICATION_NOT_AUTHORIZED');
    }
  });

  it('Credentials in request → BLOCK', async () => {
    const gw = createPhase1Gateway();
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [
        {
          role: 'user',
          content: 'Rotate this api_key=sk_live_abcdefghijklmnopqrstuv please',
        },
      ],
    });

    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('CREDENTIAL_CONTENT_BLOCKED');
    }
  });

  it('Interrogation failure fails closed (CLASSIFICATION_FAILURE)', async () => {
    const gw = createPhase1Gateway({
      interrogator: new FailingDataInterrogator(),
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Anything' }],
    });

    expect(result.httpStatus).toBe(403);
    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('CLASSIFICATION_FAILURE');
    }
  });
});
