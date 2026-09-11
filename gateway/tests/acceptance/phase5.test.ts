import { describe, expect, it } from 'vitest';
import {
  createPhase1Gateway,
  FailingResponseInspector,
  PHASE1_DEMO_API_KEY,
} from '../../src/api/app-factory.js';
import {
  DefaultModelGateway,
  InMemoryModelRegistry,
  ScriptedModelProvider,
} from '../../src/models/index.js';
import { DeterministicPolicyEngine } from '../../src/policy/engine.js';

function gatewayWithScriptedResponse(content: string, policy?: DeterministicPolicyEngine) {
  const provider = new ScriptedModelProvider(['local-general-v1'], content, {
    providerId: 'local-runtime',
  });
  const registry = new InMemoryModelRegistry([
    {
      model_id: 'local-general-v1',
      provider_id: 'local-runtime',
      name: 'Local',
      kind: 'local',
      status: 'active',
    },
  ]);
  return createPhase1Gateway({
    policy,
    providers: [provider],
    models: new DefaultModelGateway(registry, [provider]),
  });
}

describe('Phase 5 acceptance — Response Governance', () => {
  it('Model → Inspector → Policy → RELEASE for clean output', async () => {
    const gw = gatewayWithScriptedResponse('Summary: follow up in two weeks.');
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.response_decision).toBe('RELEASE');
  });

  it('Test 5 — Response contains PHI → BLOCK', async () => {
    const gw = gatewayWithScriptedResponse(
      'Patient MRN: A1234567 presents with fever and cough.',
    );
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.httpStatus).toBe(403);
    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toMatch(
        /^(RESPONSE_PHI_BLOCKED|HIPAA_PHI_OUTPUT_NOT_AUTHORIZED)$/,
      );
    }
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.response_decision).toBe('BLOCK');
  });

  it('Response contains credentials → BLOCK', async () => {
    const gw = gatewayWithScriptedResponse(
      'Use api_key=sk_live_abcdefghijklmnopqrstuv to continue',
    );
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('RESPONSE_CREDENTIAL_BLOCKED');
    }
  });

  it('Response PII is redacted then released', async () => {
    const gw = gatewayWithScriptedResponse(
      'Contact the member at member@example.com for scheduling.',
    );
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.httpStatus).toBe(200);
    expect(result.body.status).toBe('approved');
    if (result.body.status === 'approved') {
      expect(result.body.response.message.content).toContain('[REDACTED_EMAIL]');
      expect(result.body.response.message.content).not.toContain('member@example.com');
    }
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.response_transformation).toBe('redact');
    expect(last.response_decision).toBe('RELEASE');
  });

  it('Test 6 — Unauthorized detokenization leaves tokens intact', async () => {
    const token = '{{TOK_EMAIL_deadbeef}}';
    const gw = gatewayWithScriptedResponse(`Echo token ${token} back to user`);
    // Pre-seed vault so an unauthorized path could restore if buggy
    await gw.vault.store({
      token,
      organization_id: 'org_demo',
      entity_type: 'EMAIL',
      plaintext: 'secret@example.com',
      request_id: 'req_seed',
    });

    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.body.status).toBe('approved');
    if (result.body.status === 'approved') {
      expect(result.body.response.message.content).toContain(token);
      expect(result.body.response.message.content).not.toContain('secret@example.com');
    }
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.metadata?.authorize_detokenization).toBe(false);
  });

  it('Trusted release detokenizes when input was tokenized and policy authorizes', async () => {
    const prompt =
      'Email jane.doe@example.com about MRN: A1234567. Phone (415) 555-0142.';

    let modelSaw = '';
    const cloudProvider = new ScriptedModelProvider(
      ['cloud-public-gpt'],
      'placeholder',
      { providerId: 'external-openai-compatible', kind: 'cloud' },
    );
    const origExecute = cloudProvider.execute.bind(cloudProvider);
    cloudProvider.execute = async (req) => {
      modelSaw = req.messages.map((m) => m.content).join('\n');
      const tokens = [...modelSaw.matchAll(/\{\{TOK_[A-Za-z0-9_]+\}\}/g)].map((m) => m[0]);
      return {
        ...(await origExecute(req)),
        message: {
          role: 'assistant' as const,
          content: `Reachable at ${tokens.join(' / ')}`,
        },
      };
    };

    const local = new ScriptedModelProvider(['local-general-v1'], 'local ok', {
      providerId: 'local-runtime',
    });

    const gw = createPhase1Gateway({
      providers: [local, cloudProvider],
      useStubRuntime: true,
    });

    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      model: 'cloud-public-gpt',
      purpose: 'treatment',
      governance_context: {
        sensitive_data_processing: { external_processing_authorized: true },
      },
      messages: [{ role: 'user', content: prompt }],
    });

    expect(modelSaw).toMatch(/\{\{TOK_/);
    expect(modelSaw).not.toContain('jane.doe@example.com');
    expect(modelSaw).not.toContain('A1234567');
    expect(modelSaw).not.toContain('415) 555-0142');

    expect(
      result.body.status,
      `unexpected block: ${JSON.stringify(result.body)}`,
    ).toBe('approved');
    if (result.body.status === 'approved') {
      const out = result.body.response.message.content;
      expect(out).toContain('jane.doe@example.com');
      expect(out).toContain('A1234567');
      expect(out).toContain('(415) 555-0142');
      expect(out).not.toMatch(/\{\{TOK_/);
    }
    const last = (await gw.audit.list()).at(-1)!;
    expect(last.metadata?.authorize_detokenization).toBe(true);
  });

  it('Authorized detokenization restores tokens when policy allows', async () => {
    const token = '{{TOK_EMAIL_cafebabe}}';
    const policy = new DeterministicPolicyEngine({
      defaultLocalModel: 'local-general-v1',
      allowDetokenization: true,
    });
    const provider = new ScriptedModelProvider(
      ['local-general-v1'],
      `Contact ${token}`,
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
      policy,
      providers: [provider],
      models: new DefaultModelGateway(registry, [provider]),
    });
    await gw.vault.store({
      token,
      organization_id: 'org_demo',
      entity_type: 'EMAIL',
      plaintext: 'restored@example.com',
      request_id: 'req_seed',
    });

    // Input must be tokenized path so input_was_tokenized is true
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [
        {
          role: 'user',
          content: 'Email jane.doe@example.com about follow-up',
        },
      ],
    });

    // Scripted provider ignores input and returns Contact {{TOK...}}
    // Response has token + Internal-ish unless email detected in scripted content - token only is Internal
    // authorize_detokenization needs contains_tokens + input_was_tokenized + trusted + allowDetokenization
    expect(result.body.status).toBe('approved');
    if (result.body.status === 'approved') {
      expect(result.body.response.message.content).toContain('restored@example.com');
      expect(result.body.response.message.content).not.toContain(token);
    }
  });

  it('Inspection failure fails closed', async () => {
    const gw = createPhase1Gateway({
      responseInspector: new FailingResponseInspector(),
    });
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('INSPECTION_FAILURE');
    }
  });

  it('Tool/action proposals in response are blocked', async () => {
    const gw = gatewayWithScriptedResponse(
      'I will invoke tool_call send_to_url with the patient file.',
    );
    const result = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });

    expect(result.body.status).toBe('blocked');
    if (result.body.status === 'blocked') {
      expect(result.body.reason_code).toBe('RESPONSE_TOOL_OR_ACTION_BLOCKED');
    }
  });
});
