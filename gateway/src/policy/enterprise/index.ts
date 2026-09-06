export type {
  ApplicablePolicyRef,
  ClassificationLabel,
  ClassificationProvenanceEvidence,
  EnigmaAction,
  EnterprisePolicyDecisionPoint,
  EvaluationPhase,
  MatchedRuleProvenanceEvidence,
  Obligation,
  ObligationCode,
  PolicyAIContext,
  PolicyConflictRecord,
  PolicyContext,
  PolicyDecision,
  PolicyDecisionCode,
  PolicyEngineMode,
  PolicyEvaluationRequest,
  PolicyEvidence,
  PolicyExplanation,
  PolicyExplanationProvenance,
  PolicyResource,
  PolicySubject,
} from './types.js';
export { EnterprisePolicyAdapter } from './adapter.js';
export { DelegatingEnterprisePdp, buildSimulateRequest } from './pdp.js';
export {
  PackBackedEnterprisePdp,
  type BridgedEnterprisePdp,
} from './pack-pdp.js';
export { InMemoryPolicyRepository, mergeDefaultSnapshot } from './repository.js';
export { applyRegulatoryOverlays, regulatoryPackExtras, ensureDefaultOverlayRegistry, part2PackContribution, hipaaPackContribution } from './packs/regulatory.js';
export {
  HEALTHCARE_DOMAIN,
  addPackToDomain,
  getPolicyDomain,
  listDomainPackIds,
  listPolicyDomains,
  registerPolicyDomain,
  type CrossPackInteraction,
  type CrossPackResolutionMode,
  type PolicyDomain,
} from './domain.js';
export {
  applyRegisteredOverlays,
  getOverlayInterpreter,
  listRegisteredOverlayInterpreters,
  mergePackContributions,
  registerOverlayInterpreter,
  unregisterOverlayInterpreter,
  type OverlayApplyFn,
  type PackContribution,
} from './overlay-registry.js';
export { compileHipaaPack } from './packs/hipaa/compile.js';
export { compilePart2Pack } from './packs/part2/compile.js';
export {
  applyHipaaPackV2Input,
  applyHipaaPackV2Output,
  applyHipaaPackV3Input,
  applyHipaaPackV3Output,
  applyHipaaClassificationProfile,
} from './packs/hipaa/pack-v2.js';
export { applyPart2PackV1Input, applyPart2PackV1Output } from './packs/part2/pack.js';
export { PART2_PROVENANCE_GRAPH, PART2_PACK_META } from './packs/part2/compiled-bundle.js';
export { PostgresPolicyRepository, type PolicyRepository } from './pg-repository.js';
export {
  fromLegacyRequestResult,
  fromLegacyResponseResult,
  mapOperationToAction,
  toInputEvaluationRequest,
  toLegacyRequestResult,
  toLegacyResponseResult,
  toOutputEvaluationRequest,
} from './map.js';
export {
  appendRuleProvenance,
  emptyProvenanceGraph,
  resolveMatchedRuleProvenance,
  type DecisionProvenance,
  type MatchedRuleProvenance,
  type PackProvenanceGraph,
  type RegulatorySourceRecord,
} from './provenance.js';
export {
  classifyDecisionPair,
  contributionFromInterpretedResult,
  materializeResolvedOutcome,
  resolvePackContributions,
  type ConflictCategory,
  type PackEvaluationContribution,
  type PrecedenceDeclaration,
  type ResolvedPolicyOutcome,
  type ResolutionExplanation,
} from './policy-resolution.js';
export { toEvaluationRecord, type PolicyEvaluationRecord } from './evaluation-record.js';
export {
  evaluationRecordToDecisionPayload,
  deriveDecisionConsequence,
  projectRequestContext,
  recordMatchesPolicy,
  rowToEvaluationRecord,
  toEvaluationListItem,
  type DecisionConsequence,
  type ExecutionMode,
  type PolicyEvaluationListItem,
  type ProjectedRequestContext,
} from './evaluation-query.js';
export {
  expectedActionFromDecision,
  effectiveExpectedAction,
  findAuditForEvaluation,
  indexAuditsByRequestId,
  projectEnforcementResult,
  type EnforcementProjection,
  type EnforcementStatus,
  type ExpectedActionCode,
} from './enforcement-projection.js';
export {
  buildHumanResolution,
  isEligibleForHumanReview,
  reviewStateForRecord,
  withHumanResolution,
  ResolveDecisionError,
  type HumanDisposition,
  type HumanResolution,
  type ResolveDecisionInput,
  type ResolutionStatus,
  type ReviewState,
} from './decision-resolution.js';
export {
  assertResumeEligible,
  executionAfterAuthorize,
  hasResumableHeldRequest,
  markResumeFailed,
  markResumeInProgress,
  markResumed,
  ResumeEvaluationError,
  type EvaluationExecution,
  type HeldRequestSnapshot,
  type ResumeExecutionStatus,
} from './decision-resume.js';
export {
  authorityTierLabel,
  buildOperatorDecisionExplanation,
  buildOperatorNarrative,
  resolutionBasisLabel,
  resolutionCategoryLabel,
  withOperatorExplanation,
  type OperatorContributionView,
  type OperatorDecisionExplanation,
} from './decision-explanation.js';
export { HIPAA_PROVENANCE_GRAPH } from './packs/hipaa/compiled-bundle.js';
export type {
  BaselineFacts,
  InterpretedResult,
  PackPolicyMeta,
  PackSnapshot,
} from './packs/baseline.js';
export type {
  OperatorDecisionExplanationEvidence,
  PolicyResolutionContributionEvidence,
  PolicyResolutionEvidence,
} from './types.js';
export {
  simulatePolicy,
  fixtureToRequestContext,
  type PolicyTestFixture,
} from './lifecycle.js';
