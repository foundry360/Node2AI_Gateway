import { describe, expect, it } from 'vitest';
import { detectDeterministic } from '../../src/interrogation/detectors.js';
import { HybridDataInterrogator } from '../../src/interrogation/service.js';
import { classifyIntent } from '../../src/interrogation/intent.js';

describe('Deterministic detectors', () => {
  it('detects email as PII', () => {
    const result = detectDeterministic('Contact jane.doe@example.com today');
    expect(result.categories.has('PII')).toBe(true);
    expect(result.entities.some((e) => e.type === 'EMAIL')).toBe(true);
  });

  it('detects MRN / clinical markers as PHI', () => {
    const result = detectDeterministic(
      'Clinical note: Patient MRN: A1234567 diagnosed with influenza',
    );
    expect(result.categories.has('PHI')).toBe(true);
    expect(result.reason_codes).toContain('HEALTH_INFORMATION');
  });

  it('detects credentials', () => {
    const result = detectDeterministic('api_key=sk_live_abcdefghijklmnopqrstuv');
    expect(result.categories.has('Credential')).toBe(true);
  });
});

describe('HybridDataInterrogator', () => {
  it('returns structured classification evidence (never ALLOW)', async () => {
    const interrogator = new HybridDataInterrogator({ semantic: null });
    const result = await interrogator.interrogate(
      'Summarize note for MRN: Z998877',
      {
        user_id: 'user_clinician',
        application_id: 'app_clinical',
        organization_id: 'org_demo',
        operation: 'summarize',
        environment: 'prod',
        deployment_mode: 'connected',
      },
    );

    expect(result.classification.sensitivity).toBe('PHI');
    expect(result.intent).toBe('summarization');
    expect(result.risk).toBe('high');
    expect(result.reason_codes).toContain('HEALTH_INFORMATION');
    expect(JSON.stringify(result)).not.toMatch(/"ALLOW"/);
  });

  it('classifies plain text as Internal with summarization intent', async () => {
    const interrogator = new HybridDataInterrogator({ semantic: null });
    const result = await interrogator.interrogate('Summarize discharge instructions.', {
      user_id: 'user_clinician',
      application_id: 'app_clinical',
      organization_id: 'org_demo',
      operation: 'summarize',
      environment: 'prod',
      deployment_mode: 'connected',
    });

    expect(result.classification.sensitivity).toBe('Internal');
    expect(result.intent).toBe('summarization');
  });
});

describe('classifyIntent', () => {
  it('maps operation summarize to summarization', () => {
    expect(classifyIntent('summarize', 'hello')).toBe('summarization');
  });
});
