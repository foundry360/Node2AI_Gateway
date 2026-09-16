/**
 * ActorRegistry — authorization substrate lookups (not a PDP).
 */

import type {
  AgentApplicationBinding,
  AgentAutonomyLevel,
  AgentRecord,
  AgentStatus,
  AgentToolGrant,
  BindingStatus,
  GrantStatus,
  ToolRecord,
  ToolStatus,
} from './types.js';
import {
  applyRuntimeActorToGovernanceContext,
  buildRuntimeActorFacts,
} from './facts.js';
import type { ActorResolveInput, RuntimeActorFacts } from './types.js';

export interface ActorRegistry {
  resolve(input: ActorResolveInput): Promise<RuntimeActorFacts>;

  createAgent(
    input: Omit<AgentRecord, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<AgentRecord>;
  updateAgent(
    deploymentId: string,
    agentId: string,
    patch: Partial<
      Pick<AgentRecord, 'name' | 'status' | 'autonomy_level' | 'metadata'>
    >,
  ): Promise<AgentRecord | null>;
  /** Hard-delete agent and cascade bindings/grants for this deployment. */
  deleteAgent(deploymentId: string, agentId: string): Promise<boolean>;
  getAgent(
    deploymentId: string,
    agentId: string,
  ): Promise<AgentRecord | null>;
  listAgents(deploymentId: string): Promise<AgentRecord[]>;

  createTool(
    input: Omit<ToolRecord, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<ToolRecord>;
  updateTool(
    deploymentId: string,
    toolId: string,
    patch: Partial<
      Pick<ToolRecord, 'name' | 'status' | 'operations' | 'metadata'>
    >,
  ): Promise<ToolRecord | null>;
  /** Hard-delete tool and cascade grants for this deployment. */
  deleteTool(deploymentId: string, toolId: string): Promise<boolean>;
  getTool(deploymentId: string, toolId: string): Promise<ToolRecord | null>;
  listTools(deploymentId: string): Promise<ToolRecord[]>;

  upsertBinding(
    input: Omit<AgentApplicationBinding, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<AgentApplicationBinding>;
  getBinding(
    deploymentId: string,
    agentId: string,
    applicationId: string,
  ): Promise<AgentApplicationBinding | null>;

  upsertGrant(
    input: Omit<AgentToolGrant, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<AgentToolGrant>;
  getGrant(
    deploymentId: string,
    agentId: string,
    toolId: string,
  ): Promise<AgentToolGrant | null>;

  listBindingsForAgent(
    deploymentId: string,
    agentId: string,
  ): Promise<AgentApplicationBinding[]>;

  listGrantsForAgent(
    deploymentId: string,
    agentId: string,
  ): Promise<AgentToolGrant[]>;

  listGrantsForTool(
    deploymentId: string,
    toolId: string,
  ): Promise<AgentToolGrant[]>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function agentKey(deploymentId: string, agentId: string): string {
  return `${deploymentId}\0${agentId}`;
}
function toolKey(deploymentId: string, toolId: string): string {
  return `${deploymentId}\0${toolId}`;
}
function bindingKey(
  deploymentId: string,
  agentId: string,
  applicationId: string,
): string {
  return `${deploymentId}\0${agentId}\0${applicationId}`;
}
function grantKey(
  deploymentId: string,
  agentId: string,
  toolId: string,
): string {
  return `${deploymentId}\0${agentId}\0${toolId}`;
}

export class InMemoryActorRegistry implements ActorRegistry {
  private agents = new Map<string, AgentRecord>();
  private tools = new Map<string, ToolRecord>();
  private bindings = new Map<string, AgentApplicationBinding>();
  private grants = new Map<string, AgentToolGrant>();

  async resolve(input: ActorResolveInput): Promise<RuntimeActorFacts> {
    try {
      const agent = input.agentId
        ? this.agents.get(agentKey(input.deploymentId, input.agentId.trim())) ??
          null
        : null;
      const binding =
        input.agentId
          ? this.bindings.get(
              bindingKey(
                input.deploymentId,
                input.agentId.trim(),
                input.applicationId,
              ),
            ) ?? null
          : null;
      const tool = input.toolId
        ? this.tools.get(toolKey(input.deploymentId, input.toolId.trim())) ??
          null
        : null;
      const grant =
        input.agentId && input.toolId
          ? this.grants.get(
              grantKey(
                input.deploymentId,
                input.agentId.trim(),
                input.toolId.trim(),
              ),
            ) ?? null
          : null;
      return buildRuntimeActorFacts(input, { agent, binding, tool, grant });
    } catch (err) {
      return buildRuntimeActorFacts(input, {
        registryError: err instanceof Error ? err.message : 'registry_error',
      });
    }
  }

  async createAgent(
    input: Omit<AgentRecord, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<AgentRecord> {
    const key = agentKey(input.deployment_id, input.agent_id);
    if (this.agents.has(key)) {
      throw new Error(`Agent already exists: ${input.agent_id}`);
    }
    const ts = nowIso();
    const row: AgentRecord = {
      ...input,
      metadata: structuredClone(input.metadata ?? {}),
      created_at: input.created_at ?? ts,
      updated_at: input.updated_at ?? ts,
    };
    this.agents.set(key, row);
    return structuredClone(row);
  }

  async updateAgent(
    deploymentId: string,
    agentId: string,
    patch: Partial<
      Pick<AgentRecord, 'name' | 'status' | 'autonomy_level' | 'metadata'>
    >,
  ): Promise<AgentRecord | null> {
    const key = agentKey(deploymentId, agentId);
    const cur = this.agents.get(key);
    if (!cur) return null;
    const next: AgentRecord = {
      ...cur,
      ...patch,
      metadata: patch.metadata
        ? structuredClone(patch.metadata)
        : cur.metadata,
      updated_at: nowIso(),
    };
    this.agents.set(key, next);
    return structuredClone(next);
  }

  async deleteAgent(deploymentId: string, agentId: string): Promise<boolean> {
    const key = agentKey(deploymentId, agentId);
    if (!this.agents.has(key)) return false;
    for (const [bKey, binding] of this.bindings) {
      if (
        binding.deployment_id === deploymentId &&
        binding.agent_id === agentId
      ) {
        this.bindings.delete(bKey);
      }
    }
    for (const [gKey, grant] of this.grants) {
      if (grant.deployment_id === deploymentId && grant.agent_id === agentId) {
        this.grants.delete(gKey);
      }
    }
    this.agents.delete(key);
    return true;
  }

  async getAgent(
    deploymentId: string,
    agentId: string,
  ): Promise<AgentRecord | null> {
    const row = this.agents.get(agentKey(deploymentId, agentId));
    return row ? structuredClone(row) : null;
  }

  async listAgents(deploymentId: string): Promise<AgentRecord[]> {
    return [...this.agents.values()]
      .filter((a) => a.deployment_id === deploymentId)
      .map((a) => structuredClone(a));
  }

  async createTool(
    input: Omit<ToolRecord, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<ToolRecord> {
    const key = toolKey(input.deployment_id, input.tool_id);
    if (this.tools.has(key)) {
      throw new Error(`Tool already exists: ${input.tool_id}`);
    }
    const ts = nowIso();
    const row: ToolRecord = {
      ...input,
      operations: [...(input.operations ?? [])],
      metadata: structuredClone(input.metadata ?? {}),
      created_at: input.created_at ?? ts,
      updated_at: input.updated_at ?? ts,
    };
    this.tools.set(key, row);
    return structuredClone(row);
  }

  async updateTool(
    deploymentId: string,
    toolId: string,
    patch: Partial<
      Pick<ToolRecord, 'name' | 'status' | 'operations' | 'metadata'>
    >,
  ): Promise<ToolRecord | null> {
    const key = toolKey(deploymentId, toolId);
    const cur = this.tools.get(key);
    if (!cur) return null;
    const next: ToolRecord = {
      ...cur,
      ...patch,
      operations: patch.operations ? [...patch.operations] : cur.operations,
      metadata: patch.metadata
        ? structuredClone(patch.metadata)
        : cur.metadata,
      updated_at: nowIso(),
    };
    this.tools.set(key, next);
    return structuredClone(next);
  }

  async deleteTool(deploymentId: string, toolId: string): Promise<boolean> {
    const key = toolKey(deploymentId, toolId);
    if (!this.tools.has(key)) return false;
    for (const [gKey, grant] of this.grants) {
      if (grant.deployment_id === deploymentId && grant.tool_id === toolId) {
        this.grants.delete(gKey);
      }
    }
    this.tools.delete(key);
    return true;
  }

  async getTool(
    deploymentId: string,
    toolId: string,
  ): Promise<ToolRecord | null> {
    const row = this.tools.get(toolKey(deploymentId, toolId));
    return row ? structuredClone(row) : null;
  }

  async listTools(deploymentId: string): Promise<ToolRecord[]> {
    return [...this.tools.values()]
      .filter((t) => t.deployment_id === deploymentId)
      .map((t) => structuredClone(t));
  }

  async upsertBinding(
    input: Omit<AgentApplicationBinding, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<AgentApplicationBinding> {
    if (!this.agents.has(agentKey(input.deployment_id, input.agent_id))) {
      throw new Error(`Agent not found: ${input.agent_id}`);
    }
    const key = bindingKey(
      input.deployment_id,
      input.agent_id,
      input.application_id,
    );
    const existing = this.bindings.get(key);
    const ts = nowIso();
    const row: AgentApplicationBinding = {
      ...input,
      created_at: existing?.created_at ?? input.created_at ?? ts,
      updated_at: input.updated_at ?? ts,
    };
    this.bindings.set(key, row);
    return structuredClone(row);
  }

  async getBinding(
    deploymentId: string,
    agentId: string,
    applicationId: string,
  ): Promise<AgentApplicationBinding | null> {
    const row = this.bindings.get(
      bindingKey(deploymentId, agentId, applicationId),
    );
    return row ? structuredClone(row) : null;
  }

  async upsertGrant(
    input: Omit<AgentToolGrant, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<AgentToolGrant> {
    if (!this.agents.has(agentKey(input.deployment_id, input.agent_id))) {
      throw new Error(`Agent not found: ${input.agent_id}`);
    }
    if (!this.tools.has(toolKey(input.deployment_id, input.tool_id))) {
      throw new Error(`Tool not found: ${input.tool_id}`);
    }
    const key = grantKey(input.deployment_id, input.agent_id, input.tool_id);
    const existing = this.grants.get(key);
    const ts = nowIso();
    const row: AgentToolGrant = {
      ...input,
      allowed_operations: [...(input.allowed_operations ?? [])],
      created_at: existing?.created_at ?? input.created_at ?? ts,
      updated_at: input.updated_at ?? ts,
    };
    this.grants.set(key, row);
    return structuredClone(row);
  }

  async getGrant(
    deploymentId: string,
    agentId: string,
    toolId: string,
  ): Promise<AgentToolGrant | null> {
    const row = this.grants.get(grantKey(deploymentId, agentId, toolId));
    return row ? structuredClone(row) : null;
  }

  async listBindingsForAgent(
    deploymentId: string,
    agentId: string,
  ): Promise<AgentApplicationBinding[]> {
    return [...this.bindings.values()]
      .filter(
        (b) => b.deployment_id === deploymentId && b.agent_id === agentId,
      )
      .map((b) => structuredClone(b));
  }

  async listGrantsForAgent(
    deploymentId: string,
    agentId: string,
  ): Promise<AgentToolGrant[]> {
    return [...this.grants.values()]
      .filter(
        (g) => g.deployment_id === deploymentId && g.agent_id === agentId,
      )
      .map((g) => structuredClone(g));
  }

  async listGrantsForTool(
    deploymentId: string,
    toolId: string,
  ): Promise<AgentToolGrant[]> {
    return [...this.grants.values()]
      .filter(
        (g) => g.deployment_id === deploymentId && g.tool_id === toolId,
      )
      .map((g) => structuredClone(g));
  }
}

export type {
  AgentAutonomyLevel,
  AgentStatus,
  BindingStatus,
  GrantStatus,
  ToolStatus,
};

export { applyRuntimeActorToGovernanceContext, buildRuntimeActorFacts };
