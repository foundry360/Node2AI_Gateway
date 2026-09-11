import type { Obligation } from '../types.js';
import type {
  BaselineFacts,
  InterpretedResult,
  PackPolicyMeta,
  PackSnapshot,
} from './baseline.js';
import { compileHipaaPack } from './hipaa/compile.js';
import {
  applyHipaaPackV2Input,
  applyHipaaPackV2Output,
  applyHipaaPackV3Input,
  applyHipaaPackV3Output,
} from './hipaa/pack-v2.js';
import { compilePart2Pack } from './part2/compile.js';
import { applyPart2PackV1Input, applyPart2PackV1Output } from './part2/pack.js';
import { compileOncHti1Pack } from './onc-hti1/compile.js';
import { applyOncHti1PackV1Input, applyOncHti1PackV1Output } from './onc-hti1/pack.js';
import { compileNistAiRmfPack } from './nist-ai-rmf/compile.js';
import {
  applyNistAiRmfPackV1Input,
  applyNistAiRmfPackV1Output,
} from './nist-ai-rmf/pack.js';
import { compileOwaspLlm2025Pack } from './owasp-llm-2025/compile.js';
import {
  applyOwaspLlm2025PackV1Input,
  applyOwaspLlm2025PackV1Output,
} from './owasp-llm-2025/pack.js';
import { compileEuAiActPack } from './eu-ai-act/compile.js';
import {
  applyEuAiActPackV1Input,
  applyEuAiActPackV1Output,
} from './eu-ai-act/pack.js';
import { compileIso42001Pack } from './iso-42001/compile.js';
import {
  applyIso42001PackV1Input,
  applyIso42001PackV1Output,
} from './iso-42001/pack.js';
import { compileIso23894Pack } from './iso-23894/compile.js';
import {
  applyIso23894PackV1Input,
  applyIso23894PackV1Output,
} from './iso-23894/pack.js';
import { compileIso42005Pack } from './iso-42005/compile.js';
import {
  applyIso42005PackV1Input,
  applyIso42005PackV1Output,
} from './iso-42005/pack.js';
import { compileSoc2Pack } from './soc2/compile.js';
import {
  applySoc2PackV1Input,
  applySoc2PackV1Output,
} from './soc2/pack.js';
import { compileNistCsf2Pack } from './nist-csf-2/compile.js';
import {
  applyNistCsf2PackV1Input,
  applyNistCsf2PackV1Output,
} from './nist-csf-2/pack.js';
import { compileIso38507Pack } from './iso-38507/compile.js';
import {
  applyIso38507PackV1Input,
  applyIso38507PackV1Output,
} from './iso-38507/pack.js';
import { compileIso27001Pack } from './iso-27001/compile.js';
import {
  applyIso27001PackV1Input,
  applyIso27001PackV1Output,
} from './iso-27001/pack.js';
import { compileIso27701Pack } from './iso-27701/compile.js';
import {
  applyIso27701PackV1Input,
  applyIso27701PackV1Output,
} from './iso-27701/pack.js';
import { compileNistPrivacyFrameworkPack } from './nist-privacy-framework/compile.js';
import {
  applyNistPrivacyFrameworkPackV1Input,
  applyNistPrivacyFrameworkPackV1Output,
} from './nist-privacy-framework/pack.js';
import {
  applyRegisteredOverlays,
  mergePackContributions,
  registerOverlayInterpreter,
  type PackContribution,
} from '../overlay-registry.js';
import { addPackToDomain } from '../domain.js';
import { POLICY_AUTHORITY_IDS } from '../authority.js';

function isCloudModel(modelId: string): boolean {
  return (
    modelId.startsWith('cloud-') ||
    modelId.includes('public') ||
    modelId.includes('openai') ||
    modelId.includes('anthropic')
  );
}

/** Legacy v1 overlay kept for reactivation / comparison; default seed activates pack v3. */
function applyHipaa(
  current: InterpretedResult,
  facts: BaselineFacts,
  meta: PackPolicyMeta,
): InterpretedResult {
  if (facts.classification !== 'PHI') return current;

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
      obligations: [
        { code: 'LOCAL_MODEL_ONLY' },
        { code: 'NO_EXTERNAL_TRANSMISSION' },
        { code: 'LOG_GOVERNANCE_EVENT' },
      ],
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
  if (facts.classification !== 'FINANCIAL' && facts.classification !== 'Financial') {
    return current;
  }

  if (current.decision === 'DENY') {
    return { ...current, matched: [...current.matched, 'financial_overlay_skip_denied'] };
  }

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
  if (facts.classification !== 'LEGAL' && facts.classification !== 'Legal') {
    return current;
  }

  const matched = [...current.matched, 'legal_overlay'];

  if (current.decision === 'DENY') {
    return { ...current, matched: [...matched, 'legal_reinforces_deny'] };
  }

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

let defaultOverlaysRegistered = false;

/** Idempotent registration of built-in regulatory overlay interpreters. */
export function ensureDefaultOverlayRegistry(): void {
  if (defaultOverlaysRegistered) return;
  registerOverlayInterpreter('hipaa_pack_v3', applyHipaaPackV3Input);
  registerOverlayInterpreter('hipaa_pack_v3_output', applyHipaaPackV3Output);
  registerOverlayInterpreter('hipaa_pack_v2', applyHipaaPackV2Input);
  registerOverlayInterpreter('hipaa_pack_v2_output', applyHipaaPackV2Output);
  registerOverlayInterpreter('hipaa_overlay_v1', applyHipaa);
  registerOverlayInterpreter('part2_pack_v1', applyPart2PackV1Input);
  registerOverlayInterpreter('part2_pack_v1_output', applyPart2PackV1Output);
  registerOverlayInterpreter('onc_hti1_pack_v1', applyOncHti1PackV1Input);
  registerOverlayInterpreter('onc_hti1_pack_v1_output', applyOncHti1PackV1Output);
  registerOverlayInterpreter('nist_ai_rmf_pack_v1', applyNistAiRmfPackV1Input);
  registerOverlayInterpreter('nist_ai_rmf_pack_v1_output', applyNistAiRmfPackV1Output);
  registerOverlayInterpreter('owasp_llm_2025_pack_v1', applyOwaspLlm2025PackV1Input);
  registerOverlayInterpreter('owasp_llm_2025_pack_v1_output', applyOwaspLlm2025PackV1Output);
  registerOverlayInterpreter('eu_ai_act_pack_v1', applyEuAiActPackV1Input);
  registerOverlayInterpreter('eu_ai_act_pack_v1_output', applyEuAiActPackV1Output);
  registerOverlayInterpreter('iso_42001_pack_v1', applyIso42001PackV1Input);
  registerOverlayInterpreter('iso_42001_pack_v1_output', applyIso42001PackV1Output);
  registerOverlayInterpreter('iso_23894_pack_v1', applyIso23894PackV1Input);
  registerOverlayInterpreter('iso_23894_pack_v1_output', applyIso23894PackV1Output);
  registerOverlayInterpreter('iso_42005_pack_v1', applyIso42005PackV1Input);
  registerOverlayInterpreter('iso_42005_pack_v1_output', applyIso42005PackV1Output);
  registerOverlayInterpreter('soc2_pack_v1', applySoc2PackV1Input);
  registerOverlayInterpreter('soc2_pack_v1_output', applySoc2PackV1Output);
  registerOverlayInterpreter('nist_csf_2_pack_v1', applyNistCsf2PackV1Input);
  registerOverlayInterpreter('nist_csf_2_pack_v1_output', applyNistCsf2PackV1Output);
  registerOverlayInterpreter('iso_38507_pack_v1', applyIso38507PackV1Input);
  registerOverlayInterpreter('iso_38507_pack_v1_output', applyIso38507PackV1Output);
  registerOverlayInterpreter('iso_27001_pack_v1', applyIso27001PackV1Input);
  registerOverlayInterpreter('iso_27001_pack_v1_output', applyIso27001PackV1Output);
  registerOverlayInterpreter('iso_27701_pack_v1', applyIso27701PackV1Input);
  registerOverlayInterpreter('iso_27701_pack_v1_output', applyIso27701PackV1Output);
  registerOverlayInterpreter(
    'nist_privacy_framework_pack_v1',
    applyNistPrivacyFrameworkPackV1Input,
  );
  registerOverlayInterpreter(
    'nist_privacy_framework_pack_v1_output',
    applyNistPrivacyFrameworkPackV1Output,
  );
  registerOverlayInterpreter('financial_overlay_v1', applyFinancial);
  registerOverlayInterpreter('legal_overlay_v1', applyLegal);
  addPackToDomain('healthcare', 'pack_42_cfr_part_2');
  addPackToDomain('healthcare', 'pack_onc_hti1');
  addPackToDomain('ai_risk', 'pack_nist_ai_rmf');
  addPackToDomain('ai_risk', 'pack_owasp_llm_2025');
  addPackToDomain('ai_risk', 'pack_eu_ai_act');
  addPackToDomain('ai_risk', 'pack_iso_42001');
  addPackToDomain('ai_risk', 'pack_iso_23894');
  addPackToDomain('ai_risk', 'pack_iso_42005');
  addPackToDomain('ai_risk', 'pack_soc2');
  addPackToDomain('ai_risk', 'pack_nist_csf_2');
  addPackToDomain('ai_risk', 'pack_iso_38507');
  addPackToDomain('ai_risk', 'pack_iso_27001');
  addPackToDomain('ai_risk', 'pack_iso_27701');
  addPackToDomain('ai_risk', 'pack_nist_privacy_framework');
  defaultOverlaysRegistered = true;
}

/**
 * Regulatory pack overlays (M4+).
 * Dispatches via generic interpreter registry — packs register apply functions.
 * Overlays never weaken a prior DENY; they may further restrict.
 */
export function applyRegulatoryOverlays(
  result: InterpretedResult,
  facts: BaselineFacts,
  overlays: PackPolicyMeta[],
): InterpretedResult {
  ensureDefaultOverlayRegistry();
  return applyRegisteredOverlays(result, facts, overlays);
}

/** HIPAA pack contribution (reference pack under healthcare domain). */
export function hipaaPackContribution(): PackContribution {
  const hipaa = compileHipaaPack();
  return {
    packs: [
      {
        pack_id: 'pack_hipaa',
        status: 'active',
        name: 'HIPAA',
        domain: 'hipaa',
        authority_id: POLICY_AUTHORITY_IDS.hipaa,
      },
    ],
    policies: [...hipaa.policies],
  };
}

export function financialPackContribution(): PackContribution {
  return {
    packs: [
      {
        pack_id: 'pack_financial',
        status: 'draft',
        name: 'Financial Services',
        domain: 'financial',
      },
    ],
    policies: [
      {
        policy_id: 'pol_financial_tokenize',
        version: 1,
        pack_id: 'pack_financial',
        name: 'Financial data input governance',
        phase: 'input',
        status: 'suspended',
        interpreter: 'financial_overlay_v1',
        description:
          'Protects financial data in AI requests: sensitive fields are safeguarded before processing, and write, export, and sharing actions stay controlled unless human approval allows them.',
        owner: 'compliance',
        priority: 180,
        scope_tier: 'regulatory',
        domain: 'financial',
        content_hash: 'sha256:financial_overlay_v1',
        pack_name: 'Financial Services',
        pack_version: '1.0.0',
      },
    ],
  };
}

export function legalPackContribution(): PackContribution {
  return {
    packs: [
      {
        pack_id: 'pack_legal',
        status: 'draft',
        name: 'Legal',
        domain: 'legal',
      },
    ],
    policies: [
      {
        policy_id: 'pol_legal_no_external',
        version: 1,
        pack_id: 'pack_legal',
        name: 'Legal content input governance',
        phase: 'input',
        status: 'suspended',
        interpreter: 'legal_overlay_v1',
        description:
          'Keeps privileged legal content off external models and blocks export or sharing so confidential counsel material stays inside approved local or private processing paths.',
        owner: 'compliance',
        priority: 170,
        scope_tier: 'regulatory',
        domain: 'legal',
        content_hash: 'sha256:legal_overlay_v1',
        pack_name: 'Legal',
        pack_version: '1.0.0',
      },
    ],
  };
}

/** Part 2 pack contribution (Healthcare Pack #2). */
export function part2PackContribution(): PackContribution {
  const part2 = compilePart2Pack();
  return {
    packs: [
      {
        pack_id: 'pack_42_cfr_part_2',
        status: 'active',
        name: '42 CFR Part 2',
        domain: 'healthcare',
        authority_id: POLICY_AUTHORITY_IDS.part2,
      },
    ],
    policies: [...part2.policies],
  };
}

/** ONC HTI-1 thin pack contribution (Healthcare Pack #3). */
export function oncHti1PackContribution(): PackContribution {
  const onc = compileOncHti1Pack();
  return {
    packs: [
      {
        pack_id: 'pack_onc_hti1',
        status: 'active',
        name: 'ONC HTI-1 Predictive DSI (Thin)',
        domain: 'healthcare',
        authority_id: POLICY_AUTHORITY_IDS.oncHti1,
      },
    ],
    policies: [...onc.policies],
  };
}

/** NIST AI RMF pack contribution (Framework Pack #3). */
export function nistAiRmfPackContribution(): PackContribution {
  const nist = compileNistAiRmfPack();
  return {
    packs: [
      {
        pack_id: 'pack_nist_ai_rmf',
        status: 'active',
        name: 'NIST AI RMF',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.nistAiRmf,
      },
    ],
    policies: [...nist.policies],
  };
}

/** OWASP LLM Top 10 2025 pack contribution (Security Guidance Pack #4). */
export function owaspLlm2025PackContribution(): PackContribution {
  const owasp = compileOwaspLlm2025Pack();
  return {
    packs: [
      {
        pack_id: 'pack_owasp_llm_2025',
        status: 'active',
        name: 'OWASP LLM Top 10 2025',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.owaspLlm2025,
      },
    ],
    policies: [...owasp.policies],
  };
}

/** EU AI Act pack contribution (Regulation Pack #5). */
export function euAiActPackContribution(): PackContribution {
  const eu = compileEuAiActPack();
  return {
    packs: [
      {
        pack_id: 'pack_eu_ai_act',
        status: 'active',
        name: 'EU AI Act',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.euAiAct,
      },
    ],
    policies: [...eu.policies],
  };
}

/** ISO/IEC 42001 pack contribution (Standard Pack #6). */
export function iso42001PackContribution(): PackContribution {
  const iso = compileIso42001Pack();
  return {
    packs: [
      {
        pack_id: 'pack_iso_42001',
        status: 'active',
        name: 'ISO/IEC 42001',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.iso42001,
      },
    ],
    policies: [...iso.policies],
  };
}

/** ISO/IEC 23894 pack contribution (Standard Pack #7). */
export function iso23894PackContribution(): PackContribution {
  const iso = compileIso23894Pack();
  return {
    packs: [
      {
        pack_id: 'pack_iso_23894',
        status: 'active',
        name: 'ISO/IEC 23894',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.iso23894,
      },
    ],
    policies: [...iso.policies],
  };
}

/** ISO/IEC 42005 pack contribution (Standard Pack #8). */
export function iso42005PackContribution(): PackContribution {
  const iso = compileIso42005Pack();
  return {
    packs: [
      {
        pack_id: 'pack_iso_42005',
        status: 'active',
        name: 'ISO/IEC 42005',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.iso42005,
      },
    ],
    policies: [...iso.policies],
  };
}

/** SOC 2 / AICPA Trust Services Criteria pack contribution (Framework Pack #9). */
export function soc2PackContribution(): PackContribution {
  const soc2 = compileSoc2Pack();
  return {
    packs: [
      {
        pack_id: 'pack_soc2',
        status: 'active',
        name: 'SOC 2 / AICPA Trust Services Criteria',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.soc2,
      },
    ],
    policies: [...soc2.policies],
  };
}

/** NIST CSF 2.0 pack contribution (Framework Pack #10). */
export function nistCsf2PackContribution(): PackContribution {
  const csf = compileNistCsf2Pack();
  return {
    packs: [
      {
        pack_id: 'pack_nist_csf_2',
        status: 'active',
        name: 'NIST CSF 2.0',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.nistCsf2,
      },
    ],
    policies: [...csf.policies],
  };
}

/** ISO/IEC 38507 pack contribution (Standards Pack #11). */
export function iso38507PackContribution(): PackContribution {
  const iso38507 = compileIso38507Pack();
  return {
    packs: [
      {
        pack_id: 'pack_iso_38507',
        status: 'active',
        name: 'ISO/IEC 38507',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.iso38507,
      },
    ],
    policies: [...iso38507.policies],
  };
}

/** ISO/IEC 27001 pack contribution (Standards Pack #12). */
export function iso27001PackContribution(): PackContribution {
  const iso27001 = compileIso27001Pack();
  return {
    packs: [
      {
        pack_id: 'pack_iso_27001',
        status: 'active',
        name: 'ISO/IEC 27001',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.iso27001,
      },
    ],
    policies: [...iso27001.policies],
  };
}

/** ISO/IEC 27701 pack contribution (Standards Pack #13). */
export function iso27701PackContribution(): PackContribution {
  const iso27701 = compileIso27701Pack();
  return {
    packs: [
      {
        pack_id: 'pack_iso_27701',
        status: 'active',
        name: 'ISO/IEC 27701',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.iso27701,
      },
    ],
    policies: [...iso27701.policies],
  };
}

/** NIST Privacy Framework pack contribution (Framework Pack #14). */
export function nistPrivacyFrameworkPackContribution(): PackContribution {
  const nistPf = compileNistPrivacyFrameworkPack();
  return {
    packs: [
      {
        pack_id: 'pack_nist_privacy_framework',
        status: 'active',
        name: 'NIST Privacy Framework',
        domain: 'ai_risk',
        authority_id: POLICY_AUTHORITY_IDS.nistPrivacyFramework,
      },
    ],
    policies: [...nistPf.policies],
  };
}

/**
 * Framework pack definitions for default EPA snapshot.
 * Contributions merge generically — add future packs via mergePackContributions.
 */
export function regulatoryPackExtras(): Pick<PackSnapshot, 'packs' | 'policies'> {
  ensureDefaultOverlayRegistry();
  return mergePackContributions(
    hipaaPackContribution(),
    part2PackContribution(),
    oncHti1PackContribution(),
    nistAiRmfPackContribution(),
    owaspLlm2025PackContribution(),
    euAiActPackContribution(),
    iso42001PackContribution(),
    iso23894PackContribution(),
    iso42005PackContribution(),
    soc2PackContribution(),
    nistCsf2PackContribution(),
    iso38507PackContribution(),
    iso27001PackContribution(),
    iso27701PackContribution(),
    nistPrivacyFrameworkPackContribution(),
    financialPackContribution(),
    legalPackContribution(),
  );
}
