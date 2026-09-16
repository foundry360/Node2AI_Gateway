import { describe, expect, it } from 'vitest';
import { assertResponseGrounded } from '../../src/response/grounding.js';

describe('assertResponseGrounded', () => {
  const chart = [
    'Name: Charles Greene',
    'MRN: MRN-10042',
    'Date of Birth: 1978-08-22',
    'Last visit date (exact): 2026-08-23',
    'Email: charles.greene.demo@example.com',
  ].join('\n');

  it('allows claims that appear in the source chart', () => {
    const result = assertResponseGrounded(
      chart,
      'Last visit was 2026-08-23. DOB is 1978-08-22.',
    );
    expect(result.ok).toBe(true);
  });

  it('blocks invented dates not present in the source chart', () => {
    const result = assertResponseGrounded(
      chart,
      "The patient's last visit was on 2026-08-24.",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason_code).toBe('UNGROUNDED_RESPONSE_CLAIM');
      expect(result.ungrounded).toContain('date:2026-08-24');
    }
  });

  it('blocks invented DOB values', () => {
    const result = assertResponseGrounded(
      chart,
      "Mr. Greene's date of birth is listed as 10/12/1967.",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.ungrounded.some((c) => c.startsWith('date:'))).toBe(true);
    }
  });

  it('ignores vault tokens in the response (detokenize path)', () => {
    const result = assertResponseGrounded(
      chart,
      'Date of Birth is {{TOK_DOB_abc123}}.',
    );
    expect(result.ok).toBe(true);
  });

  it('normalizes MRN forms so MRN-10042 matches chart "MRN: MRN-10042"', () => {
    const result = assertResponseGrounded(
      chart,
      'Charles Greene (MRN-10042) was seen recently.',
    );
    expect(result.ok).toBe(true);
  });
});
