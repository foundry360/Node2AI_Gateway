/**
 * Phase A — Agent/Tool authorization substrate types.
 * Registry facts only — never a PDP decision.
 */

export type ActorRegistryMode = 'off' | 'shadow' | 'enforce';

export type AgentStatus = 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
export type ToolStatus = 'ACTIVE' | 'SUSPENDED' | 'RETIRED';
export type BindingStatus = 'ACTIVE' | 'SUSPENDED';
export type GrantStatus = 'ACTIVE' | 'REVOKED';
export type AgentAutonomyLevel =
  | 'ASSISTIVE'
  | 'HUMAN_APPROVED'
  | 'AUTONOMOUS';

export interface AgentRecord {
  deployment_id: string;
  agent_id: string;
  organization_id: string;
  name: string;
  status: AgentStatus;
  autonomy_level: AgentAutonomyLevel;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ToolRecord {
  deployment_id: string;
  tool_id: string;
  organization_id: string;
  name: string;
  status: ToolStatus;
  /** Declared operation identifiers — empty means no operations. */
  operations: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AgentApplicationBinding {
  deployment_id: string;
  agent_id: string;
  application_id: string;
  status: BindingStatus;
  created_at: string;
  updated_at: string;
}

export interface AgentToolGrant {
  deployment_id: string;
  agent_id: string;
  tool_id: string;
  /** Explicit allowlist — empty/null never means allow-all. */
  allowed_operations: string[];
  status: GrantStatus;
  created_at: string;
  updated_at: string;
}

export interface RuntimeAgentFacts {
  id: string;
  name?: string | null;
  registered: boolean;
  status: AgentStatus | 'UNKNOWN' | null;
  bound_to_application: boolean;
  autonomy_level: AgentAutonomyLevel | null;
  authorized: boolean;
}

export interface RuntimeToolFacts {
  id: string;
  name?: string | null;
  registered: boolean;
  status: ToolStatus | 'UNKNOWN' | null;
  granted_to_agent: boolean;
  operation: string | null;
  operation_declared: boolean;
  operation_granted: boolean;
  authorized: boolean;
}

export interface RuntimeActorSubstrate {
  agent_authorized: boolean | null;
  tool_authorized: boolean | null;
  reason_codes: string[];
}

/** Server-authored facts for EPA — not a policy decision. */
export interface RuntimeActorFacts {
  mode: ActorRegistryMode;
  agent: RuntimeAgentFacts | null;
  tool: RuntimeToolFacts | null;
  substrate: RuntimeActorSubstrate;
  /** Present in shadow/enforce for migration visibility. */
  client_attested?: {
    agent_authorized?: boolean;
    tool_authorized?: boolean;
  };
  mismatch?: boolean;
  registry_error?: string | null;
}

export interface ActorResolveInput {
  deploymentId: string;
  applicationId: string;
  organizationId: string;
  agentId?: string | null;
  toolId?: string | null;
  /** Normalized requested operation (action.kind ?? operation). */
  operation?: string | null;
  mode: ActorRegistryMode;
  clientAgentAuthorized?: boolean;
  clientToolAuthorized?: boolean;
}

export const ACTOR_REASON = {
  AGENT_NOT_REGISTERED: 'AGENT_NOT_REGISTERED',
  AGENT_NOT_ACTIVE: 'AGENT_NOT_ACTIVE',
  AGENT_NOT_BOUND: 'AGENT_NOT_BOUND',
  TOOL_NOT_REGISTERED: 'TOOL_NOT_REGISTERED',
  TOOL_NOT_ACTIVE: 'TOOL_NOT_ACTIVE',
  TOOL_NOT_GRANTED: 'TOOL_NOT_GRANTED',
  OPERATION_NOT_DECLARED: 'OPERATION_NOT_DECLARED',
  OPERATION_NOT_GRANTED: 'OPERATION_NOT_GRANTED',
  TOOL_REQUIRES_AGENT: 'TOOL_REQUIRES_AGENT',
  REGISTRY_UNAVAILABLE: 'REGISTRY_UNAVAILABLE',
  AGENT_UNAUTHORIZED: 'AGENT_UNAUTHORIZED',
  TOOL_UNAUTHORIZED: 'TOOL_UNAUTHORIZED',
} as const;
