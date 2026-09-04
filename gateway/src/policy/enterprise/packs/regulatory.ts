import type { Obligation } from '../types.js';
import type {
  BaselineFacts,
  InterpretedResult,
  PackPolicyMeta,
  PackSnapshot,
} from './baseline.js';

function isCloudModel(modelId: string): boolean {
  return (
    modelId.startsWith('cloud-') ||
    modelId.includes('public') ||
    modelId.includes('openai') ||
    modelId.includes('anthropic')
  );
}

/**
 * Regulatory pack overlays (M4 framework).
 * Subset rules only — full regulatory packs are Future expansions.
 * Overlays never weaken a prior DENY; they may further restrict.
 */
export function applyRegulatoryOverlays(
  result: InterpretedResult,
  facts: BaselineFacts,
  overlays: PackPolicyMeta[],
): InterpretedResult {
  let current = { ...result, obligations: [...result.obligations], matched: [...result.matched] };

  for (const meta of overlays) {
    if (meta.status !== 'active') continue;

    if (meta.interpreter === 'hipaa_overlay_v1' && facts.classification === 'PHI') {
      current = applyHipaa(current, facts, meta);
    }
    if (
      meta.interpreter === 'financial_overlay_v1' &&
      (facts.classification === 'FINANCIAL' || facts.classification === 'Financial')
    ) {
      current = applyFinancial(current, facts, meta);
    }
    if (
      meta.interpreter === 'legal_overlay_v1' &&
      (facts.classification === 'LEGAL' || facts.classification === 'Legal')
    ) {
      current = applyLegal(current, facts, meta);
    }
  }

  return current;
}

function applyHipaa(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  const matched = [...current.matched, 'hipaa_overlay'];

  if (current.decision === 'DENY') {
    const obligations: Obligation[] = [...current.obligations];
    if (!obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY')) {
      obligations.push({ code: 'LOCAL_MODEL_ONLY' });
    }
    if (!obligations.some((o) => o.code === 'NO_EXTERNAL_TRANSMISSION')) {
      obligations.push({ code: 'NO_EXTERNAL_TRANSMISSION' });
    }
    return { ...current, obligations, matched: [...matched, 'hipaa_reinforces_deny'] };
  }

  const cloudRequested =
    !!facts.requested_model && isCloudModel(facts.requested_model);
  const eligibleCloud = current.eligible_models.some((m) => isCloudModel(m));

  if (cloudRequested || eligibleCloud) {
    return {
      ...current,
      decision: 'DENY',
      reason_codes: ['HIPAA_PHI_CLOUD_BLOCKED', ...current.reason_codes],
      eligible_models: [],
      transforms: [],
      obligations: [{ code: 'LOCAL_MODEL_ONLY' }, { code: 'NO_EXTERNAL_TRANSMISSION' }, { code: 'LOG_GOVERNANCE_EVENT' }],
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched: [...matched, 'hipaa_cloud_denied'],
    };
  }

  const obligations: Obligation[] = [...current.obligations];
  if (!obligations.some((o) => o.code === 'LOCAL_MODEL_ONLY')) {
    obligations.push({ code: 'LOCAL_MODEL_ONLY' });
  }
  if (!obligations.some((o) => o.code === 'NO_EXTERNAL_TRANSMISSION')) {
    obligations.push({ code: 'NO_EXTERNAL_TRANSMISSION' });
  }

  return {
    ...current,
    eligible_models: current.eligible_models.filter((m) => m.startsWith('local-')),
    obligations,
    matched,
  };
}

function applyFinancial(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (current.decision === 'DENY') {
    return { ...current, matched: [...current.matched, 'financial_overlay_skip_denied'] };
  }

  // Expand: block WRITE/EXPORT/SHARE of financial data without approval obligation.
  if (['write', 'export', 'share', 'transmit'].includes(facts.operation)) {
    return {
      ...current,
      decision: 'DENY',
      reason_codes: ['FINANCIAL_WRITE_REQUIRES_APPROVAL', ...current.reason_codes],
      eligible_models: [],
      transforms: [],
      obligations: [
        { code: 'REQUIRE_HUMAN_APPROVAL_FOR_EXECUTION' },
        { code: 'LOG_GOVERNANCE_EVENT' },
      ],
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched: [...current.matched, 'financial_write_blocked'],
    };
  }

  const obligations: Obligation[] = [...current.obligations];
  if (!obligations.some((o) => o.code === 'TOKENIZE_PII')) {
    obligations.push({
      code: 'TOKENIZE_PII',
      parameters: { targets: ['FINANCIAL'] },
    });
  }

  return {
    ...current,
    decision: current.decision === 'ALLOW' ? 'TOKENIZE' : current.decision,
    reason_codes: [...new Set([...current.reason_codes, 'FINANCIAL_REQUIRES_TOKENIZE'])],
    transforms:
      current.transforms.length > 0
        ? current.transforms
        : [{ type: 'tokenize', targets: ['FINANCIAL'] }],
    obligations,
    matched: [...current.matched, 'financial_overlay'],
    policy_id: current.decision === 'ALLOW' ? meta.policy_id : current.policy_id,
    pack_id: meta.pack_id,
  };
}

function applyLegal(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  const matched = [...current.matched, 'legal_overlay'];

  if (current.decision === 'DENY') {
    return { ...current, matched: [...matched, 'legal_reinforces_deny'] };
  }

  // Expand: EXPORT/SHARE of legal data always denied.
  if (['export', 'share', 'transmit'].includes(facts.operation)) {
    return {
      ...current,
      decision: 'DENY',
      reason_codes: ['LEGAL_EXPORT_BLOCKED', ...current.reason_codes],
      eligible_models: [],
      transforms: [],
      obligations: [
        { code: 'NO_EXTERNAL_TRANSMISSION' },
        { code: 'LOG_GOVERNANCE_EVENT' },
      ],
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched: [...matched, 'legal_export_blocked'],
    };
  }

  const cloudRequested =
    !!facts.requested_model && isCloudModel(facts.requested_model);
  const eligibleCloud = current.eligible_models.some((m) => isCloudModel(m));

  if (cloudRequested || eligibleCloud) {
    return {
      ...current,
      decision: 'DENY',
      reason_codes: ['LEGAL_EXTERNAL_MODEL_BLOCKED', ...current.reason_codes],
      eligible_models: [],
      transforms: [],
      obligations: [
        { code: 'LOCAL_MODEL_ONLY' },
        { code: 'NO_EXTERNAL_TRANSMISSION' },
        { code: 'LOG_GOVERNANCE_EVENT' },
      ],
      policy_id: meta.policy_id,
      policy_version: meta.version,
      pack_id: meta.pack_id,
      matched: [...matched, 'legal_external_denied'],
    };
  }

  const obligations: Obligation[] = [...current.obligations];
  if (!obligations.some((o) => o.code === 'NO_EXTERNAL_TRANSMISSION')) {
    obligations.push({ code: 'NO_EXTERNAL_TRANSMISSION' });
  }

  return {
    ...current,
    eligible_models: current.eligible_models.filter((m) => m.startsWith('local-')),
    obligations,
    matched,
  };
}

/** Framework pack definitions for default EPA snapshot (M4). */
export function regulatoryPackExtras(): Pick<PackSnapshot, 'packs' | 'policies'> {
  return {
    packs: [
      {
        pack_id: 'pack_hipaa',
        status: 'active',
        name: 'HIPAA',
        domain: 'hipaa',
      },
      {
        pack_id: 'pack_financial',
        status: 'draft',
        name: 'Financial Services',
        domain: 'financial',
      },
      {
        pack_id: 'pack_legal',
        status: 'draft',
        name: 'Legal',
        domain: 'legal',
      },
    ],
    policies: [
      {
        policy_id: 'pol_hipaa_phi_local',
        version: 1,
        pack_id: 'pack_hipaa',
        name: 'PHI local-only (HIPAA overlay)',
        phase: 'input',
        status: 'active',
        interpreter: 'hipaa_overlay_v1',
      },
      {
        policy_id: 'pol_financial_tokenize',
        version: 1,
        pack_id: 'pack_financial',
        name: 'Financial tokenize (framework)',
        phase: 'input',
        status: 'suspended',
        interpreter: 'financial_overlay_v1',
      },
      {
        policy_id: 'pol_legal_no_external',
        version: 1,
        pack_id: 'pack_legal',
        name: 'Legal no external models (framework)',
        phase: 'input',
        status: 'suspended',
        interpreter: 'legal_overlay_v1',
      },
    ],
  };
}
