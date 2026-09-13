import { describe, expect, it } from 'vitest';
import { getPolicyDefinition } from '../../src/policy/enterprise/packs/definitions.js';
import {
  getFrameworkPackDefinition,
  listFrameworkDefinitionPolicyIds,
} from '../../src/policy/enterprise/packs/framework-pack-definitions.js';
import { formatRuleConditionStatement } from '../../src/policy/enterprise/packs/derive-definition.js';
import { mergeDefaultSnapshot } from '../../src/policy/enterprise/repository.js';

describe('policy definition coverage', () => {
  it('derives definitions for all framework pack policies', () => {
    const ids = listFrameworkDefinitionPolicyIds();
    expect(ids.length).toBe(24);
    for (const id of ids) {
      const def = getFrameworkPackDefinition(id);
      expect(def, id).toBeTruthy();
      expect(def!.subjects.length).toBeGreaterThan(0);
      expect(def!.resources.length).toBeGreaterThan(0);
      expect(def!.actions.length).toBeGreaterThan(0);
      expect(def!.ai_context.length).toBeGreaterThan(0);
      expect(def!.conditions.length).toBeGreaterThan(0);
      expect(def!.decisions.length).toBeGreaterThan(0);
      expect(def!.obligations.length).toBeGreaterThan(0);
    }
  });

  it('covers every EPA snapshot policy via getPolicyDefinition', () => {
    const policies = mergeDefaultSnapshot().policies;
    expect(policies.length).toBeGreaterThanOrEqual(36);
    const missing: string[] = [];
    for (const p of policies) {
      const def = getPolicyDefinition(p.policy_id, p.interpreter);
      if (!def) missing.push(`${p.policy_id} (${p.interpreter})`);
    }
    expect(missing).toEqual([]);
  });

  it('formats rule conditions into IF/THEN statements', () => {
    expect(
      formatRuleConditionStatement({
        rule_id: 'R1',
        name: 'test',
        phase: 'input',
        conditions: {
          regulatory_applicability: 'EU_AI_ACT',
          high_risk_established: true,
        },
        decision: 'REVIEW',
      }),
    ).toBe(
      'IF regulatory_applicability = EU_AI_ACT AND high_risk_established = true THEN REVIEW',
    );
  });

  it('keeps hand-authored HIPAA definition richer than empty', () => {
    const def = getPolicyDefinition('pol_hipaa_phi_local', 'hipaa_pack_v3');
    expect(def?.domain).toBe('hipaa');
    expect(def?.conditions.some((c) => c.id.includes('HIPAA'))).toBe(true);
  });

  it('returns EU AI Act input definition with derived decisions', () => {
    const def = getPolicyDefinition('pol_eu_ai_act_input', 'eu_ai_act_pack_v1');
    expect(def).toBeTruthy();
    expect(def!.domain).toBe('ai_risk');
    expect(def!.decisions.length).toBeGreaterThan(3);
    expect(def!.decisions.some((d) => d.decision === 'DENY')).toBe(true);
  });
});
