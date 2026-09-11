/**
 * Governed autonomy for Agent WRITE:
 * Policy decides ALLOW / ALLOW_WITH_CONTROLS / REQUIRE_APPROVAL(REVIEW) / DENY.
 * WRITE must not hardcode human review.
 */
import { describe, expect, it } from 'vitest';
import type { Application, User } from '../../src/identity/types.js';
import {
  InMemoryChangeGovernanceRepository,
  InMemoryPolicyRepository,
  PackBackedEnterprisePdp,
  buildHumanResolution,
  commitAuthorizedLifecycleChange,
  createGovernanceBaseline,
  evaluateGovernanceChange,
  withHumanResolution,
} from '../../src/policy/enterprise/index.js';

const user: User = {
  user_id: 'user_write_gov',
  organization_id: 'org_demo',
  roles: ['clinician'],
  permissions: [],
  status: 'active',
};

const internalApp: Application = {
  application_id: 'app_internal_tasks',
  organization_id: 'org_demo',
  name: 'Internal Tasks',
  type: 'internal',
  environment: 'prod',
  trust_level: 'trusted',
  status: 'active',
  allowed_models: ['local-general-v1'],
  allowed_datasets: [],
  allowed_operations: ['summarize', 'write'],
};

const GOVERNANCE_DOCUMENTED = {
  accountability_documented: true,
  system_context_documented: true,
  measurement_documented: true,
  risk_response_documented: true,
};

const clinicalApp: Application = {
  ...internalApp,
  application_id: 'app_clinical_write',
  name: 'Clinical Writer',
  type: 'clinical',
};

describe('Write governance — governed autonomy', () => {
  it('1. Authorized low-risk WRITE → ALLOW → auto-executes (baseline commit, no hold)', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = changeRepo.saveBaseline(
      createGovernanceBaseline({
        target_type: 'application',
        target_id: internalApp.application_id,
        capabilities: { write_capability: false },
      }),
    );

    const result = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: {
        user,
        application: internalApp,
        operation: 'write',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        sensitivity: 'INTERNAL',
        regulatory_applicability: ['NIST_AI_RMF'],
        governance_context: GOVERNANCE_DOCUMENTED,
      },
      input: {
        target_type: 'application',
        target_id: internalApp.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { write_capability: true },
        request_id: 'req_wg_1',
      },
    });

    expect(result.materiality).toBe('MATERIAL');
    expect(String(result.policy_decision?.decision).toUpperCase()).toBe('ALLOW');
    expect(result.next_baseline?.capabilities.write_capability).toBe(true);
    const stored = policyRepo.getEvaluation(result.evaluation_id!);
    expect(stored?.held_request).toBeFalsy();
    expect(stored?.evidence_in?.authorization_mode).toBe('AUTOMATICALLY_AUTHORIZED');
  });

  it('2. WRITE with controls path preserves obligations without human hold', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user,
      application: clinicalApp,
      operation: 'summarize',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'medium',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
      governance_context: {
        accountability_documented: true,
        system_context_documented: true,
        measurement_documented: true,
        risk_response_documented: true,
      },
    });
    expect(['ALLOW', 'ALLOW_WITH_CONTROLS', 'TOKENIZE']).toContain(
      String(decision.decision).toUpperCase(),
    );
    expect(String(decision.decision).toUpperCase()).not.toBe('REVIEW');
  });

  it('3. High-risk PHI WRITE with explicit approval policy → REVIEW/REQUIRE_APPROVAL', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user,
      application: clinicalApp,
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });
    expect(['REVIEW', 'REQUIRE_APPROVAL']).toContain(
      String(decision.decision).toUpperCase(),
    );
    expect(decision.reason_codes).toContain('HIPAA_PHI_WRITE_REQUIRES_APPROVAL');
  });

  it('4. Prohibited PHI externalize → DENY', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user,
      application: {
        ...clinicalApp,
        allowed_operations: ['summarize', 'write', 'export'],
      },
      operation: 'export',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'PHI',
        confidence: 0.99,
        risk: 'high',
        reason_codes: ['REGULATORY_APPLICABILITY:HIPAA'],
      },
      deploymentMode: 'connected',
      purpose: 'treatment',
      authorization_context: 'authorized',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('HIPAA_PHI_WRITEBACK_NOT_AUTHORIZED');
  });

  it('5. Unauthorized WRITE (operation not allowlisted) → DENY', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user,
      application: {
        ...internalApp,
        allowed_operations: ['summarize'],
      },
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'low',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('OPERATION_NOT_ALLOWED');
  });

  it('7. Missing identity / inactive application → DENY', async () => {
    const repo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(repo);
    const decision = await pdp.evaluateLegacyRequest({
      user,
      application: { ...internalApp, status: 'suspended' },
      operation: 'write',
      requestedModel: 'local-general-v1',
      availableModels: ['local-general-v1'],
      environment: 'prod',
      classification: {
        sensitivity: 'INTERNAL',
        confidence: 0.9,
        risk: 'low',
        reason_codes: [],
      },
      deploymentMode: 'connected',
    });
    expect(decision.decision).toBe('DENY');
    expect(decision.reason_codes).toContain('APPLICATION_INACTIVE');
  });

  it('8–11. REQUIRE_APPROVAL authorize executes; deny does not; auto ALLOW has no queue item; human does not overwrite machine decision', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = changeRepo.saveBaseline(
      createGovernanceBaseline({
        target_type: 'application',
        target_id: clinicalApp.application_id,
        capabilities: { write_capability: false },
      }),
    );

    const heldResult = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: {
        user,
        application: clinicalApp,
        operation: 'write',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        sensitivity: 'PHI',
        regulatory_applicability: ['HIPAA'],
      },
      input: {
        target_type: 'application',
        target_id: clinicalApp.application_id,
        previous_baseline_id: previous.baseline_id,
        proposed_state: { write_capability: true },
        request_id: 'req_wg_hold',
      },
    });
    expect(String(heldResult.policy_decision?.decision).toUpperCase()).toBe('REVIEW');
    expect(heldResult.next_baseline).toBeFalsy();
    const machineDecision = heldResult.policy_decision!.decision;
    const held = policyRepo.getEvaluation(heldResult.evaluation_id!)!;
    expect(held.held_request).toBeTruthy();
    expect(held.evidence_in?.authorization_mode).toBe('HUMAN_AUTHORIZATION');

    const authorized = withHumanResolution(
      held,
      buildHumanResolution(held, {
        disposition: 'AUTHORIZE',
        reason: 'Approved clinical write capability',
        resolved_by: 'reviewer_wg',
      }),
    );
    expect(authorized.decision).toBe(machineDecision);
    expect(authorized.human_resolution?.final_decision).toBe('ALLOW');
    const committed = commitAuthorizedLifecycleChange({
      record: authorized,
      repository: changeRepo,
    });
    expect(committed?.capabilities.write_capability).toBe(true);

    // Denied hold does not commit
    const previous2 = changeRepo.saveBaseline(
      createGovernanceBaseline({
        target_type: 'application',
        target_id: 'app_clinical_write_2',
        capabilities: { write_capability: false },
      }),
    );
    const held2 = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: {
        user,
        application: { ...clinicalApp, application_id: 'app_clinical_write_2' },
        operation: 'write',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        sensitivity: 'PHI',
        regulatory_applicability: ['HIPAA'],
      },
      input: {
        target_type: 'application',
        target_id: 'app_clinical_write_2',
        previous_baseline_id: previous2.baseline_id,
        proposed_state: { write_capability: true },
        request_id: 'req_wg_deny',
      },
    });
    const denied = withHumanResolution(
      policyRepo.getEvaluation(held2.evaluation_id!)!,
      buildHumanResolution(policyRepo.getEvaluation(held2.evaluation_id!)!, {
        disposition: 'DENY',
        reason: 'Rejected',
        resolved_by: 'reviewer_wg',
      }),
    );
    expect(denied.human_resolution?.final_decision).toBe('DENY');
    expect(
      changeRepo.latestBaseline('application', 'app_clinical_write_2')?.capabilities
        .write_capability,
    ).not.toBe(true);
  });

  it('10. Automatic ALLOW action does not create a human-review queue item', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const autoPrev = changeRepo.saveBaseline(
      createGovernanceBaseline({
        target_type: 'application',
        target_id: 'app_internal_auto_queue',
        capabilities: { write_capability: false },
      }),
    );
    const auto = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: {
        user,
        application: {
          ...internalApp,
          application_id: 'app_internal_auto_queue',
        },
        operation: 'write',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        sensitivity: 'INTERNAL',
        regulatory_applicability: ['NIST_AI_RMF'],
        governance_context: GOVERNANCE_DOCUMENTED,
      },
      input: {
        target_type: 'application',
        target_id: 'app_internal_auto_queue',
        previous_baseline_id: autoPrev.baseline_id,
        proposed_state: {
          write_capability: true,
          tools: [{ id: 'update_task_status', write: true }],
        },
        request_id: 'req_wg_auto_queue',
      },
    });
    expect(String(auto.policy_decision?.decision).toUpperCase()).toBe('ALLOW');
    const autoStored = policyRepo.getEvaluation(auto.evaluation_id!);
    expect(autoStored?.held_request).toBeFalsy();
    expect(autoStored?.evidence_in?.lifecycle_hold).not.toBe(true);
    expect(autoStored?.evidence_in?.authorization_mode).toBe(
      'AUTOMATICALLY_AUTHORIZED',
    );
  });

  it('13. Audit evidence exists for automatic and human-reviewed actions', async () => {
    const changeRepo = new InMemoryChangeGovernanceRepository();
    const policyRepo = new InMemoryPolicyRepository();
    const pdp = new PackBackedEnterprisePdp(policyRepo);
    const previous = changeRepo.saveBaseline(
      createGovernanceBaseline({
        target_type: 'application',
        target_id: 'app_audit_write',
        capabilities: { write_capability: false },
      }),
    );

    const auto = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: {
        user,
        application: { ...internalApp, application_id: 'app_audit_write' },
        operation: 'write',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        sensitivity: 'INTERNAL',
        regulatory_applicability: ['NIST_AI_RMF'],
        governance_context: GOVERNANCE_DOCUMENTED,
      },
      input: {
        target_type: 'application',
        target_id: 'app_audit_write',
        previous_baseline_id: previous.baseline_id,
        proposed_state: { write_capability: true },
        request_id: 'req_wg_audit_auto',
      },
    });
    const autoEval = policyRepo.getEvaluation(auto.evaluation_id!)!;
    expect(autoEval.request_id).toBe('req_wg_audit_auto');
    expect(autoEval.evidence_in?.authorization_mode).toBe('AUTOMATICALLY_AUTHORIZED');
    expect(autoEval.decision).toBeTruthy();

    const previousPhi = changeRepo.saveBaseline(
      createGovernanceBaseline({
        target_type: 'application',
        target_id: 'app_audit_write_phi',
        capabilities: { write_capability: false },
      }),
    );
    const held = await evaluateGovernanceChange({
      repository: changeRepo,
      policy_repository: policyRepo,
      pdp,
      policy_context: {
        user,
        application: { ...clinicalApp, application_id: 'app_audit_write_phi' },
        operation: 'write',
        requestedModel: 'local-general-v1',
        availableModels: ['local-general-v1'],
        sensitivity: 'PHI',
        regulatory_applicability: ['HIPAA'],
      },
      input: {
        target_type: 'application',
        target_id: 'app_audit_write_phi',
        previous_baseline_id: previousPhi.baseline_id,
        proposed_state: { write_capability: true },
        request_id: 'req_wg_audit_human',
      },
    });
    const heldEval = policyRepo.getEvaluation(held.evaluation_id!)!;
    expect(heldEval.evidence_in?.authorization_mode).toBe('HUMAN_AUTHORIZATION');
    expect(heldEval.evidence_in?.change_types).toEqual(
      expect.arrayContaining(['WRITE_CAPABILITY']),
    );
  });
});
