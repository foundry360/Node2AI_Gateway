import { describe, expect, it } from 'vitest';
import { IntegrityAuditService } from '../../src/audit/integrity-service.js';
import { InMemoryAuditService } from '../../src/audit/service.js';
import {
  hashResponseContent,
  verifyAuditChain,
} from '../../src/audit/integrity.js';
import { createPhase1Gateway, PHASE1_DEMO_API_KEY } from '../../src/api/app-factory.js';

describe('Audit response integrity', () => {
  it('hashes released responses and maintains a verifiable chain', async () => {
    const gw = createPhase1Gateway({
      config: { auditSigningKey: 'test-audit-key' },
    });

    const r1 = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Summarize discharge instructions.' }],
    });
    expect(r1.httpStatus).toBe(200);
    if (r1.body.status !== 'approved') throw new Error('expected approved');
    expect(r1.body.integrity.response_hash).toBe(
      hashResponseContent(r1.body.response.message.content),
    );
    expect(r1.body.integrity.event_hash.length).toBe(64);

    const r2 = await gw.orchestrator.completions(PHASE1_DEMO_API_KEY, {
      application_id: 'app_clinical',
      user: { id: 'user_clinician' },
      operation: 'summarize',
      messages: [{ role: 'user', content: 'Second request.' }],
    });
    expect(r2.httpStatus).toBe(200);
    if (r2.body.status !== 'approved') throw new Error('expected approved');
    expect(r2.body.integrity.prev_event_hash).toBe(r1.body.integrity.event_hash);

    const integrity = await (gw.audit as IntegrityAuditService).verifyIntegrity();
    expect(integrity.ok).toBe(true);
    expect(integrity.checked).toBeGreaterThanOrEqual(2);
  });

  it('detects tampering with a stored response_hash', async () => {
    const inner = new InMemoryAuditService();
    const audit = new IntegrityAuditService(inner, 'test-audit-key');
    await audit.record({
      audit_id: 'aud_1',
      timestamp: new Date().toISOString(),
      request_id: 'req_1',
      correlation_id: 'corr_1',
      policy_decision: 'ALLOW',
      response_decision: 'RELEASE',
      metadata: { __response_content: 'hello world' },
    });
    const events = await audit.list();
    events[0]!.response_hash = '0'.repeat(64);
    const result = verifyAuditChain(events, 'test-audit-key');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('event_hash_mismatch');
  });
});
