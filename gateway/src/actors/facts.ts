/**
 * Build RuntimeActorFacts from registry lookup rows.
 * Produces substrate authorization facts — never ALLOW/DENY/REVIEW.
 */

import {
  ACTOR_REASON,
  type ActorResolveInput,
  type AgentApplicationBinding,
  type AgentRecord,
  type AgentToolGrant,
  type RuntimeActorFacts,
  type ToolRecord,
} from './types.js';

export type { ActorResolveInput };

export function normalizeRequestedOperation(opts: {
  operation?: string | null;
  actionKind?: string | null;
}): string | null {
  const kind = opts.actionKind?.trim();
  if (kind) return kind;
  const op = opts.operation?.trim();
  return op || null;
}

export function buildRuntimeActorFacts(
  input: ActorResolveInput,
  rows: {
    agent?: AgentRecord | null;
    binding?: AgentApplicationBinding | null;
    tool?: ToolRecord | null;
    grant?: AgentToolGrant | null;
    registryError?: string | null;
  },
): RuntimeActorFacts {
  const reason_codes: string[] = [];
  const client_attested = {
    ...(input.clientAgentAuthorized !== undefined
      ? { agent_authorized: input.clientAgentAuthorized }
      : {}),
    ...(input.clientToolAuthorized !== undefined
      ? { tool_authorized: input.clientToolAuthorized }
      : {}),
  };

  if (rows.registryError) {
    reason_codes.push(ACTOR_REASON.REGISTRY_UNAVAILABLE);
    const agentId = input.agentId?.trim() || null;
    const toolId = input.toolId?.trim() || null;
    return {
      mode: input.mode,
      agent: agentId
        ? {
            id: agentId,
            registered: false,
            status: 'UNKNOWN',
            bound_to_application: false,
            autonomy_level: null,
            authorized: false,
          }
        : null,
      tool: toolId
        ? {
            id: toolId,
            registered: false,
            status: 'UNKNOWN',
            granted_to_agent: false,
            operation: input.operation ?? null,
            operation_declared: false,
            operation_granted: false,
            authorized: false,
          }
        : null,
      substrate: {
        agent_authorized: agentId ? false : null,
        tool_authorized: toolId ? false : null,
        reason_codes,
      },
      client_attested,
      mismatch: true,
      registry_error: rows.registryError,
    };
  }

  let agentAuthorized: boolean | null = null;
  let agentFacts: RuntimeActorFacts['agent'] = null;

  if (input.agentId?.trim()) {
    const id = input.agentId.trim();
    const agent = rows.agent;
    const binding = rows.binding;
    const registered = !!agent;
    const status = agent?.status ?? 'UNKNOWN';
    const bound =
      !!binding &&
      binding.status === 'ACTIVE' &&
      binding.application_id === input.applicationId;
    const active = registered && status === 'ACTIVE';
    const authorized = active && bound;
    if (!registered) reason_codes.push(ACTOR_REASON.AGENT_NOT_REGISTERED);
    else if (!active) reason_codes.push(ACTOR_REASON.AGENT_NOT_ACTIVE);
    if (registered && !bound) reason_codes.push(ACTOR_REASON.AGENT_NOT_BOUND);
    if (!authorized) reason_codes.push(ACTOR_REASON.AGENT_UNAUTHORIZED);
    agentAuthorized = authorized;
    agentFacts = {
      id,
      name: agent?.name ?? null,
      registered,
      status,
      bound_to_application: bound,
      autonomy_level: agent?.autonomy_level ?? null,
      authorized,
    };
  }

  let toolAuthorized: boolean | null = null;
  let toolFacts: RuntimeActorFacts['tool'] = null;

  if (input.toolId?.trim()) {
    const id = input.toolId.trim();
    const tool = rows.tool;
    const grant = rows.grant;
    const operation = input.operation?.trim() || null;
    const registered = !!tool;
    const status = tool?.status ?? 'UNKNOWN';
    const toolActive = registered && status === 'ACTIVE';
    const declaredOps = tool?.operations ?? [];
    const operationDeclared = !!operation && declaredOps.includes(operation);
    const grantActive = !!grant && grant.status === 'ACTIVE';
    const grantedOps = grant?.allowed_operations ?? [];
    const operationGranted =
      grantActive && !!operation && grantedOps.includes(operation);
    const grantedToAgent = grantActive;
    const agentOk = agentAuthorized === true;
    if (!input.agentId?.trim()) {
      reason_codes.push(ACTOR_REASON.TOOL_REQUIRES_AGENT);
    }
    if (!registered) reason_codes.push(ACTOR_REASON.TOOL_NOT_REGISTERED);
    else if (!toolActive) reason_codes.push(ACTOR_REASON.TOOL_NOT_ACTIVE);
    if (registered && toolActive && !grantedToAgent) {
      reason_codes.push(ACTOR_REASON.TOOL_NOT_GRANTED);
    }
    if (operation && registered && !operationDeclared) {
      reason_codes.push(ACTOR_REASON.OPERATION_NOT_DECLARED);
    }
    if (operation && grantActive && operationDeclared && !operationGranted) {
      reason_codes.push(ACTOR_REASON.OPERATION_NOT_GRANTED);
    }
    const authorized =
      agentOk &&
      toolActive &&
      grantedToAgent &&
      !!operation &&
      operationDeclared &&
      operationGranted;
    if (!authorized) reason_codes.push(ACTOR_REASON.TOOL_UNAUTHORIZED);
    toolAuthorized = authorized;
    toolFacts = {
      id,
      name: tool?.name ?? null,
      registered,
      status,
      granted_to_agent: grantedToAgent,
      operation,
      operation_declared: operationDeclared,
      operation_granted: operationGranted,
      authorized,
    };
  }

  const uniqueReasons = [...new Set(reason_codes)];
  const serverAgent = agentAuthorized;
  const serverTool = toolAuthorized;
  const clientAgent = input.clientAgentAuthorized;
  const clientTool = input.clientToolAuthorized;
  const mismatch =
    (serverAgent !== null &&
      clientAgent !== undefined &&
      serverAgent !== clientAgent) ||
    (serverTool !== null &&
      clientTool !== undefined &&
      serverTool !== clientTool);

  return {
    mode: input.mode,
    agent: agentFacts,
    tool: toolFacts,
    substrate: {
      agent_authorized: agentAuthorized,
      tool_authorized: toolAuthorized,
      reason_codes: uniqueReasons,
    },
    client_attested,
    mismatch,
    registry_error: null,
  };
}

/**
 * Merge server substrate into governance_context for pack compatibility.
 * In off mode, returns client context unchanged (no runtime_actor).
 */
export function applyRuntimeActorToGovernanceContext(
  mode: ActorResolveInput['mode'],
  clientGovernance: Record<string, unknown> | undefined,
  facts: RuntimeActorFacts | null,
): Record<string, unknown> | undefined {
  const base = { ...(clientGovernance ?? {}) };
  if (mode === 'off' || !facts) {
    return Object.keys(base).length ? base : undefined;
  }

  // Client attestation retained only for forensics — never as authority.
  const clientAttested = {
    agent_authorized: base.agent_authorized,
    tool_authorized: base.tool_authorized,
  };
  delete base.agent_authorized;
  delete base.tool_authorized;

  if (facts.substrate.agent_authorized !== null) {
    base.agent_authorized = facts.substrate.agent_authorized;
  }
  if (facts.substrate.tool_authorized !== null) {
    base.tool_authorized = facts.substrate.tool_authorized;
  }
  base.runtime_actor = facts;
  base.client_attested_actor = clientAttested;
  return base;
}
