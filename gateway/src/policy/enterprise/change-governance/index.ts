export type {
  AutonomyLevel,
  ChangeEvaluationResult,
  ChangeInput,
  ChangeReviewContext,
  GovernanceBaseline,
  GovernanceBaselineCapabilities,
  GovernanceBaselineTargetType,
  GovernanceChangeType,
  GovernanceImpactDimension,
  LifecycleDecision,
  MaterialityAssessment,
  MaterialityClass,
  NormalizedChange,
} from './types.js';

export {
  createGovernanceBaseline,
  nextBaselineFromChange,
  type CreateBaselineInput,
} from './baseline.js';

export {
  assessMateriality,
  inferChangeTypes,
  lifecycleToPolicyHold,
} from './materiality.js';

export {
  applyLifecycleReviewHold,
  buildChangeReviewEvidence,
  buildLifecycleChangeInventory,
  buildLifecycleReviewMessages,
  evaluateGovernanceChange,
  type ChangeReviewAction,
  type ChangeReviewEvidence,
  type ChangeReviewItem,
  type ChangeReviewPreview,
  type EvaluateChangeOptions,
} from './evaluate.js';

export { InMemoryChangeGovernanceRepository } from './repository.js';
