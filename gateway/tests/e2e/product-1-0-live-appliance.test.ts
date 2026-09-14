/**
 * Product 1.0 Final E2E — black-box against a running appliance.
 *
 * ENIGMA_E2E_LIVE=1 npm test -- tests/e2e/product-1-0-live-appliance.test.ts
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const LIVE = process.env.ENIGMA_E2E_LIVE === '1';
const GW = (process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const APP_KEY =
  process.env.GATEWAY_E2E_APP_KEY ?? 'n2ai_test_key_approved_app';
const APP_ID = process.env.GATEWAY_E2E_APP_ID ?? 'app_clinical';
const AGENT_ID = 'agent_e2e_live';
const TOOL_ID = 'update_patient_field';

function loadAdminKey(): string {
  if (process.env.GATEWAY_ADMIN_API_KEY) return process.env.GATEWAY_ADMIN_API_KEY;
  const envPath = resolve(process.cwd(), '.env');
  if (existsSync(envPath)) {
    const raw = readFileSync(envPath, 'utf8');
    const m = raw.match(/^GATEWAY_ADMIN_API_KEY=(.+)$/m);
    if (m?.[1]) return m[1].trim();
  }
  throw new Error('GATEWAY_ADMIN_API_KEY required for live E2E');
}

async function api(
  method: string,
  path: string,
  opts: { key?: string; body?: unknown; admin?: boolean } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.admin) headers.Authorization = `Bearer ${loadAdminKey()}`;
  else if (opts.key !== undefined && opts.key !== '')
    headers.Authorization = `Bearer ${opts.key}`;
  else if (!opts.admin && opts.key !== '')
    headers.Authorization = `Bearer ${APP_KEY}`;

  const res = await fetch(`${GW}${path}`, {
    method,
    headers: opts.key === '' && !opts.admin ? { 'Content-Type': 'application/json' } : headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status, body };
}

async function seedActors(): Promise<void> {
  // Idempotent-ish: create agent/tool; ignore conflicts by continuing.
  await api('POST', '/v1/admin/agents', {
    admin: true,
    body: {
      agent_id: AGENT_ID,
      organization_id: 'org_demo',
      name: 'E2E Live Agent',
      status: 'ACTIVE',
      autonomy_level: 'HUMAN_APPROVED',
      application_id: APP_ID,
    },
  });
  await api('PUT', `/v1/admin/agents/${AGENT_ID}/applications/${APP_ID}`, {
    admin: true,
    body: { status: 'ACTIVE' },
  });
  await api('POST', '/v1/admin/tools', {
    admin: true,
    body: {
      tool_id: TOOL_ID,
      organization_id: 'org_demo',
      name: 'Update Patient Field',
      status: 'ACTIVE',
      operations: ['write', 'field_update', 'clinical_note', 'summarize'],
    },
  });
  await api('PUT', `/v1/admin/agents/${AGENT_ID}/tools/${TOOL_ID}`, {
    admin: true,
    body: {
      status: 'ACTIVE',
      allowed_operations: ['write', 'field_update', 'clinical_note', 'summarize'],
    },
  });
}

const describeLive = LIVE ? describe : describe.skip;

describeLive('Product 1.0 live appliance E2E', () => {
  beforeAll(async () => {
    await seedActors();
  }, 60_000);

  it(
    'health: gateway + postgres + local runtime',
    async () => {
      const res = await fetch(`${GW}/health`);
      expect(res.status).toBe(200);
      const h = (await res.json()) as {
        status: string;
        service: string;
        database?: { ok?: boolean };
        local_runtime?: { available?: boolean };
      };
      expect(h.status).toBe('ok');
      expect(h.service).toBe('node2ai-gateway');
      expect(h.database?.ok).toBe(true);
      expect(h.local_runtime?.available).toBe(true);
    },
    30_000,
  );

  it('invalid credentials fail closed', async () => {
    const { status, body } = await api('POST', '/v1/ai/completions', {
      key: 'definitely_not_a_valid_key',
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'summarize',
        model: 'local-general-v1',
        messages: [{ role: 'user', content: 'hi' }],
      },
    });
    expect(status).toBe(401);
    expect(JSON.stringify(body)).not.toMatch(/commit_allowed/);
  });

  it(
    'ALLOW completion on local model',
    async () => {
      const { status, body } = await api('POST', '/v1/ai/completions', {
        body: {
          application_id: APP_ID,
          user: { id: 'user_clinician' },
          operation: 'summarize',
          model: 'local-general-v1',
          agent_id: AGENT_ID,
          tool_id: TOOL_ID,
          messages: [
            {
              role: 'user',
              content: 'E2E allow: summarize that readiness looks good.',
            },
          ],
          purpose: 'treatment',
          authorization_context: 'authorized',
        },
      });
      expect(status).toBe(200);
      expect(body.status).toBe('approved');
    },
    180_000,
  );

  it('DENY completion when unauthorized', async () => {
    const { status, body } = await api('POST', '/v1/ai/completions', {
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'summarize',
        model: 'cloud-public-gpt',
        messages: [
          {
            role: 'user',
            content:
              'Patient John Doe MRN 12345 DOB 1980-01-01 needs cloud summary of PHI.',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'unauthorized',
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(status).toBe(403);
    expect(JSON.stringify(body)).not.toMatch(/commit_allowed/);
  });

  it(
    'ALLOW action yields commit_allowed + client_commit_required; Outcome is client_reported',
    async () => {
      const { status, body } = await api('POST', '/v1/ai/actions', {
        body: {
          application_id: APP_ID,
          user: { id: 'user_clinician' },
          operation: 'write',
          model: 'local-general-v1',
          agent_id: AGENT_ID,
          tool_id: TOOL_ID,
          messages: [
            {
              role: 'user',
              content:
                'Agent write: update patient field.\nPatient: Demo\nMRN: MRN-E2E\nDOB: 1980-01-01\nField: phone\nValue: 555-0100',
            },
          ],
          purpose: 'treatment',
          authorization_context: 'authorized',
          action: {
            kind: 'field_update',
            target_id: 'patient_e2e_allow',
            attributes: { field: 'phone', value: '555-0100' },
          },
          regulatory_applicability: ['HIPAA'],
        },
      });
      expect(status).toBe(200);
      expect(body.action).toBe('commit_allowed');
      expect(body.enforcement_boundary).toBe('client_commit_required');
      const evaluationId = String(body.evaluation_id);

      const detail = await api('GET', `/v1/admin/evaluations/${evaluationId}`, {
        admin: true,
      });
      expect(detail.status).toBe(200);
      const ei = detail.body.enforcement_integrity as
        | { boundary?: string }
        | undefined;
      expect(String(ei?.boundary ?? '')).toMatch(/CLIENT_COMMIT/i);

      const outcome = await api('POST', '/v1/ai/actions/outcome', {
        body: {
          application_id: APP_ID,
          evaluation_id: evaluationId,
          execution_id: `exec_e2e_${Date.now()}`,
          outcome: 'EXECUTED',
          user: { id: 'user_clinician' },
          agent_id: AGENT_ID,
          tool_id: TOOL_ID,
          operation: 'write',
          purpose: 'treatment',
          authorization_context: 'authorized',
          action: {
            kind: 'field_update',
            target_id: 'patient_e2e_allow',
            attributes: { field: 'phone' },
          },
        },
      });
      expect(outcome.status).toBe(200);
      expect(outcome.body.evidence_class).toBe('client_reported');

      const after = await api('GET', `/v1/admin/evaluations/${evaluationId}`, {
        admin: true,
      });
      const decisionPayload = after.body.decision as
        | { decision?: string }
        | string
        | undefined;
      const machine =
        typeof decisionPayload === 'string'
          ? decisionPayload
          : decisionPayload?.decision ?? after.body.machine_decision;
      expect(String(machine).toUpperCase()).toMatch(/ALLOW/);
    },
    60_000,
  );

  it('DENY action never yields commit_allowed', async () => {
    const { status, body } = await api('POST', '/v1/ai/actions', {
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        agent_id: AGENT_ID,
        tool_id: TOOL_ID,
        messages: [
          {
            role: 'user',
            content: 'Agent write clinical note with PHI for deny path.',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'unauthorized',
        action: {
          kind: 'clinical_note',
          target_id: 'patient_e2e_deny',
          attributes: { field: 'note' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(status).toBe(403);
    expect(body.action).not.toBe('commit_allowed');
  });

  it('unregistered Agent/Tool ids fail closed under enforce', async () => {
    const { status, body } = await api('POST', '/v1/ai/actions', {
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        agent_id: 'agent_not_registered_e2e',
        tool_id: 'tool_not_registered_e2e',
        messages: [
          {
            role: 'user',
            content:
              'Agent write: update patient field.\nField: phone\nValue: x',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        governance_context: {
          agent_authorized: true,
          tool_authorized: true,
        },
        action: {
          kind: 'field_update',
          target_id: 'patient_spoof',
          attributes: { field: 'phone', value: 'x' },
        },
      },
    });
    expect(status).toBe(403);
    expect(body.action).not.toBe('commit_allowed');
  });

  it('client cannot supply Decision / skip_policy / commit_allowed', async () => {
    const { status, body } = await api('POST', '/v1/ai/actions', {
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        messages: [{ role: 'user', content: 'try override' }],
        purpose: 'treatment',
        authorization_context: 'authorized',
        skip_policy: true,
        decision: 'ALLOW',
        commit_allowed: true,
      },
    });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).not.toMatch(/"action":"commit_allowed"/);
  });

  it('Action category/boundary spoof in governance_context rejected', async () => {
    const { status, body } = await api('POST', '/v1/ai/actions', {
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        agent_id: AGENT_ID,
        tool_id: TOOL_ID,
        messages: [
          {
            role: 'user',
            content:
              'Agent write: update patient field.\nField: phone\nValue: 1',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        governance_context: {
          action_category: 'DELETE',
          write_governance_class: 'CLINICAL_NOTE',
          enforcement_boundary: 'gateway_enforced',
        },
        action: {
          kind: 'field_update',
          target_id: 'patient_spoof2',
          attributes: { field: 'phone', value: '1' },
        },
      },
    });
    expect(status).toBe(400);
    expect(JSON.stringify(body)).not.toMatch(/"action":"commit_allowed"/);
  });

  it(
    'REVIEW → approver AUTHORIZE → resume mismatch fails → resume succeeds',
    async () => {
      const held = await api('POST', '/v1/ai/actions', {
        body: {
          application_id: APP_ID,
          user: { id: 'user_clinician' },
          operation: 'write',
          model: 'local-general-v1',
          agent_id: AGENT_ID,
          tool_id: TOOL_ID,
          messages: [
            {
              role: 'user',
              content:
                'Agent write clinical note.\nPatient: Review Demo\nMRN: MRN-REV\nDOB: 1975-05-05\nNote: Requires human review for clinical content governance path with sufficient length.',
            },
          ],
          purpose: 'treatment',
          authorization_context: 'authorized',
          action: {
            kind: 'clinical_note',
            target_id: 'patient_e2e_review',
            attributes: { field: 'note' },
          },
          regulatory_applicability: ['HIPAA'],
        },
      });
      expect(held.status).toBe(403);
      expect(held.body.action).not.toBe('commit_allowed');
      const evaluationId = String(held.body.evaluation_id ?? '');
      expect(evaluationId).toMatch(/^eval_/);
      expect(String(held.body.machine_decision ?? held.body.decision ?? '')).toMatch(
        /REVIEW/i,
      );

      const premature = await api('POST', '/v1/ai/actions', {
        body: {
          application_id: APP_ID,
          user: { id: 'user_clinician' },
          operation: 'write',
          model: 'local-general-v1',
          resume_evaluation_id: evaluationId,
          agent_id: AGENT_ID,
          tool_id: TOOL_ID,
          messages: held.body
            ? [
                {
                  role: 'user',
                  content:
                    'Agent write clinical note.\nPatient: Review Demo\nMRN: MRN-REV\nDOB: 1975-05-05\nNote: Requires human review for clinical content governance path with sufficient length.',
                },
              ]
            : [{ role: 'user', content: 'resume' }],
          purpose: 'treatment',
          authorization_context: 'authorized',
          action: {
            kind: 'clinical_note',
            target_id: 'patient_e2e_review',
            attributes: { field: 'note' },
          },
        },
      });
      expect(premature.status).toBeGreaterThanOrEqual(400);
      expect(premature.body.action).not.toBe('commit_allowed');

      const resolve = await api(
        'POST',
        `/v1/admin/evaluations/${evaluationId}/resolve`,
        {
          admin: true,
          body: {
            disposition: 'AUTHORIZE',
            reason: 'E2E approver authorization for held clinical write',
          },
        },
      );
      expect(resolve.status).toBe(200);

      const mismatch = await api('POST', '/v1/ai/actions', {
        body: {
          application_id: APP_ID,
          user: { id: 'user_clinician' },
          operation: 'write',
          model: 'local-general-v1',
          resume_evaluation_id: evaluationId,
          agent_id: AGENT_ID,
          // omit tool_id held on Decision
          messages: [
            {
              role: 'user',
              content:
                'Agent write clinical note.\nPatient: Review Demo\nMRN: MRN-REV\nDOB: 1975-05-05\nNote: Requires human review for clinical content governance path with sufficient length.',
            },
          ],
          purpose: 'treatment',
          authorization_context: 'authorized',
          action: {
            kind: 'clinical_note',
            target_id: 'patient_e2e_review',
            attributes: { field: 'note' },
          },
        },
      });
      expect(mismatch.status).toBe(409);
      expect(String(mismatch.body.reason_code ?? '')).toMatch(/CONTEXT_MISMATCH/i);
      expect(mismatch.body.action).not.toBe('commit_allowed');

      const resume = await api('POST', '/v1/ai/actions', {
        body: {
          application_id: APP_ID,
          user: { id: 'user_clinician' },
          operation: 'write',
          model: 'local-general-v1',
          resume_evaluation_id: evaluationId,
          agent_id: AGENT_ID,
          tool_id: TOOL_ID,
          messages: [
            {
              role: 'user',
              content:
                'Agent write clinical note.\nPatient: Review Demo\nMRN: MRN-REV\nDOB: 1975-05-05\nNote: Requires human review for clinical content governance path with sufficient length.',
            },
          ],
          purpose: 'treatment',
          authorization_context: 'authorized',
          action: {
            kind: 'clinical_note',
            target_id: 'patient_e2e_review',
            attributes: { field: 'note' },
          },
        },
      });
      expect(resume.status).toBe(200);
      expect(resume.body.action).toBe('commit_allowed');
      expect(resume.body.enforcement_boundary).toBe('client_commit_required');
    },
    90_000,
  );

  it(
    'healthcare regulatory_applicability paths remain governed (HIPAA/Part2/ONC/CMS)',
    async () => {
      // Actions path exercises packs through EPA without depending on Ollama latency.
      for (const pack of ['HIPAA', 'PART2', 'ONC_HTI1', 'CMS'] as const) {
        const { status, body } = await api('POST', '/v1/ai/actions', {
          body: {
            application_id: APP_ID,
            user: { id: 'user_clinician' },
            operation: 'write',
            model: 'local-general-v1',
            agent_id: AGENT_ID,
            tool_id: TOOL_ID,
            messages: [
              {
                role: 'user',
                content: `Agent write: update patient field.\nPatient: Pack ${pack}\nMRN: MRN-${pack}\nDOB: 1980-01-01\nField: phone\nValue: 555-0199`,
              },
            ],
            purpose: 'treatment',
            authorization_context: 'authorized',
            action: {
              kind: 'field_update',
              target_id: `patient_pack_${pack.toLowerCase()}`,
              attributes: { field: 'phone', value: '555-0199' },
            },
            regulatory_applicability: [pack],
          },
        });
        expect([200, 403]).toContain(status);
        if (status === 200) {
          expect(body.action).toBe('commit_allowed');
          expect(body.enforcement_boundary).toBe('client_commit_required');
        } else {
          expect(body.action).not.toBe('commit_allowed');
        }
        const evaluationId = String(body.evaluation_id ?? '');
        if (evaluationId.startsWith('eval_')) {
          const detail = await api('GET', `/v1/admin/evaluations/${evaluationId}`, {
            admin: true,
          });
          expect(detail.status).toBe(200);
          expect(detail.body.source).toBe('policy_evaluations');
        }
      }
    },
    120_000,
  );

  it('explicit DENY precedence: unauthorized HIPAA + CMS never yields commit_allowed', async () => {
    const { status, body } = await api('POST', '/v1/ai/actions', {
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        agent_id: AGENT_ID,
        tool_id: TOOL_ID,
        messages: [
          {
            role: 'user',
            content:
              'Agent write clinical note with PHI.\nPatient: Deny Precedence\nMRN: MRN-DENY\nDOB: 1970-01-01\nNote: unauthorized path must remain DENY under CMS composition.',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'unauthorized',
        action: {
          kind: 'clinical_note',
          target_id: 'patient_deny_precedence',
          attributes: { field: 'note' },
        },
        regulatory_applicability: ['HIPAA', 'CMS'],
      },
    });
    expect(status).toBe(403);
    expect(body.action).not.toBe('commit_allowed');
    expect(String(body.machine_decision ?? body.decision ?? '')).toMatch(/DENY/i);
  });

  it('model eligibility: ineligible/cloud model fails closed under local restrictions', async () => {
    const { status, body } = await api('POST', '/v1/ai/completions', {
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'summarize',
        model: 'cloud-public-gpt',
        agent_id: AGENT_ID,
        tool_id: TOOL_ID,
        messages: [
          {
            role: 'user',
            content:
              'Patient Jane Roe MRN 99999 DOB 1990-02-02 PHI summary request for cloud model eligibility check.',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(body)).not.toMatch(/commit_allowed/);
  });

  it('Decision and actor snapshots persist in policy_evaluations (authoritative)', async () => {
    const { status, body } = await api('POST', '/v1/ai/actions', {
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        agent_id: AGENT_ID,
        tool_id: TOOL_ID,
        messages: [
          {
            role: 'user',
            content:
              'Agent write: update patient field.\nPatient: Persist\nMRN: MRN-PERS\nDOB: 1988-08-08\nField: phone\nValue: 555-0111',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'authorized',
        action: {
          kind: 'field_update',
          target_id: 'patient_persist',
          attributes: { field: 'phone', value: '555-0111' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    expect(status).toBe(200);
    const evaluationId = String(body.evaluation_id);
    const detail = await api('GET', `/v1/admin/evaluations/${evaluationId}`, {
      admin: true,
    });
    expect(detail.status).toBe(200);
    expect(detail.body.source).toBe('policy_evaluations');
    const runtime = detail.body.runtime_actor as
      | {
          agent?: { id?: string };
          tool?: { id?: string };
        }
      | undefined;
    const reqCtx = detail.body.request_context as
      | { agent_id?: string; tool_id?: string }
      | undefined;
    expect(
      String(runtime?.agent?.id ?? reqCtx?.agent_id ?? ''),
    ).toMatch(/agent_e2e_live/);
    expect(
      String(runtime?.tool?.id ?? reqCtx?.tool_id ?? ''),
    ).toMatch(/update_patient_field/);
    const ag = detail.body.action_governance as
      | { write_governance_class?: string }
      | undefined;
    expect(String(ag?.write_governance_class ?? '')).toMatch(
      /ADMINISTRATIVE|CLINICAL|UNKNOWN/i,
    );
  });

  it('client Action fact spoof cannot force commit_allowed on unauthorized path', async () => {
    const { status, body } = await api('POST', '/v1/ai/actions', {
      body: {
        application_id: APP_ID,
        user: { id: 'user_clinician' },
        operation: 'write',
        model: 'local-general-v1',
        agent_id: AGENT_ID,
        tool_id: TOOL_ID,
        messages: [
          {
            role: 'user',
            content:
              'Agent write clinical note spoof attempt with sufficient length for governance evaluation.',
          },
        ],
        purpose: 'treatment',
        authorization_context: 'unauthorized',
        // Client-supplied authorization/governance elevation claims must not succeed.
        write_governance_class: 'ADMINISTRATIVE_LOW_RISK',
        action_governance: {
          write_governance_class: 'ADMINISTRATIVE_LOW_RISK',
          commit_allowed: true,
        },
        decision: 'ALLOW',
        commit_allowed: true,
        action: {
          kind: 'clinical_note',
          target_id: 'patient_spoof_action',
          attributes: { field: 'note' },
        },
        regulatory_applicability: ['HIPAA'],
      },
    });
    // Fail closed: schema rejection (400) or policy DENY (403) — never commit_allowed.
    expect(status).toBeGreaterThanOrEqual(400);
    expect(body.action).not.toBe('commit_allowed');
    expect(body.enforcement_boundary).not.toBe('client_commit_required');
  });

  it('air-gapped/local runtime path is healthy (Ollama available)', async () => {
    const res = await fetch(`${GW}/health`);
    const h = (await res.json()) as {
      local_runtime?: {
        available?: boolean;
        mode?: string;
        active_runtime?: string;
      };
    };
    expect(h.local_runtime?.available).toBe(true);
    expect(String(h.local_runtime?.mode ?? h.local_runtime?.active_runtime ?? '')).toMatch(
      /ollama|local/i,
    );
  });

  it('Decision list sourced from policy_evaluations', async () => {
    const list = await api('GET', '/v1/admin/evaluations?limit=5', {
      admin: true,
    });
    expect(list.status).toBe(200);
    expect(list.body.source).toBe('policy_evaluations');
    expect(Array.isArray(list.body.evaluations)).toBe(true);
  });

  it('Outcome without commit authorization fails closed', async () => {
    const { status } = await api('POST', '/v1/ai/actions/outcome', {
      body: {
        application_id: APP_ID,
        evaluation_id: 'eval_does_not_exist_e2e',
        execution_id: `exec_bad_${Date.now()}`,
        outcome: 'EXECUTED',
      },
    });
    expect(status).toBeGreaterThanOrEqual(400);
  });

  it('audit integrity endpoint available', async () => {
    const { status } = await api('GET', '/v1/admin/audit/integrity', {
      admin: true,
    });
    expect(status).toBe(200);
  });

  it('production config safety module refuses actor=off under production license', async () => {
    // Process-local assertion (same code path as appliance startup) — not a mock Gateway.
    const { loadConfig } = await import('../../src/shared/config.js');
    const { assertStartupConfigSafety } = await import(
      '../../src/shared/production-config.js'
    );
    const cfg = loadConfig({
      GATEWAY_ACTOR_REGISTRY_MODE: 'off',
      GATEWAY_ADMIN_API_KEY: 'secure_admin_key_for_test',
    } as NodeJS.ProcessEnv);
    expect(() =>
      assertStartupConfigSafety(
        cfg,
        { ENIGMA_LICENSE_MODE: 'production' } as NodeJS.ProcessEnv,
        () => {},
      ),
    ).toThrow(/ACTOR_REGISTRY_OFF/);
  });
});
