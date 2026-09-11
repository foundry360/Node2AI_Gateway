import { describe, expect, it } from 'vitest';
import {
  InputTransformService,
  InMemoryTokenVault,
} from '../../src/transform/index.js';

describe('InputTransformService', () => {
  it('redacts entities when decision is REDACT', async () => {
    const svc = new InputTransformService(new InMemoryTokenVault());
    const result = await svc.apply({
      organization_id: 'org_demo',
      request_id: 'req_1',
      correlation_id: 'corr_1',
      text: 'SSN 123-45-6789 is sensitive',
      entities: [
        {
          type: 'SSN',
          preview: '12…89',
          start: 4,
          end: 15,
          source: 'deterministic',
        },
      ],
      decision: 'REDACT',
      transforms: [{ type: 'redact', targets: ['PII'] }],
    });

    expect(result.action).toBe('redact');
    expect(result.transformed_text).toContain('[REDACTED_SSN]');
    expect(result.transformed_text).not.toContain('123-45-6789');
  });

  it('masks entities when decision is MASK', async () => {
    const svc = new InputTransformService(new InMemoryTokenVault());
    const result = await svc.apply({
      organization_id: 'org_demo',
      request_id: 'req_1',
      correlation_id: 'corr_1',
      text: 'Call 555-123-4567 now',
      entities: [
        {
          type: 'PHONE',
          preview: '55…67',
          start: 5,
          end: 17,
          source: 'deterministic',
        },
      ],
      decision: 'MASK',
      transforms: [{ type: 'mask', targets: ['PII'] }],
    });

    expect(result.action).toBe('mask');
    expect(result.transformed_text).not.toContain('555-123-4567');
    expect(result.transformed_text).toMatch(/\*+4567/);
  });

  it('filters entities by transform targets (minimum necessary)', async () => {
    const svc = new InputTransformService(new InMemoryTokenVault());
    const result = await svc.apply({
      organization_id: 'org_demo',
      request_id: 'req_targets',
      correlation_id: 'corr_1',
      text: 'MRN ABC12345 and SSN 123-45-6789',
      entities: [
        {
          type: 'MRN',
          preview: 'AB…45',
          start: 4,
          end: 12,
          source: 'deterministic',
        },
        {
          type: 'SSN',
          preview: '12…89',
          start: 21,
          end: 32,
          source: 'deterministic',
        },
      ],
      decision: 'REDACT',
      transforms: [{ type: 'redact', targets: ['SSN'] }],
    });
    expect(result.transformed_text).toContain('ABC12345');
    expect(result.transformed_text).toContain('[REDACTED_SSN]');
    expect(result.transformed_text).not.toContain('123-45-6789');
  });
});
