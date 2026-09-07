export type {
  AutonomyLevel,
  ChangeEvaluationResult,
  ChangeInput,
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
  evaluateGovernanceChange,
  type EvaluateChangeOptions,
} from './evaluate.js';

export { InMemoryChangeGovernanceRepository } from './repository.js';
