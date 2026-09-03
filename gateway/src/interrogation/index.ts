export type {
  DataInterrogator,
  DetectedEntity,
  InterrogationContext,
  InterrogationResult,
  SemanticClassifier,
  SensitivityLabel,
} from './types.js';
export { HybridDataInterrogator, FailingDataInterrogator } from './service.js';
export { HeuristicSemanticClassifier } from './semantic.js';
export { detectDeterministic } from './detectors.js';
