export type {
  ActorRegistryMode,
  AgentAutonomyLevel,
  AgentRecord,
  AgentStatus,
  AgentApplicationBinding,
  AgentToolGrant,
  BindingStatus,
  GrantStatus,
  RuntimeActorFacts,
  ToolRecord,
  ToolStatus,
} from './types.js';
export { ACTOR_REASON } from './types.js';
export {
  applyRuntimeActorToGovernanceContext,
  buildRuntimeActorFacts,
  normalizeRequestedOperation,
} from './facts.js';
export {
  InMemoryActorRegistry,
  type ActorRegistry,
} from './registry.js';
export { PostgresActorRegistry } from './pg-registry.js';
export {
  ACTION_CATEGORIES,
  ACTION_OPERATIONS,
  WRITE_ACTION_KINDS,
  actionCatalogPayload,
  isCatalogOperation,
  normalizeCatalogOperation,
  unknownCatalogOperations,
  type ActionCategoryId,
  type ActionOperationId,
  type WriteActionKindId,
} from './action-catalog.js';
