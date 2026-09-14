/**
 * PostgreSQL ActorRegistry — deployment-scoped substrate lookups.
 */

import type { PgQueryable } from '../shared/pg.js';
import { buildRuntimeActorFacts } from './facts.js';
import type { ActorRegistry } from './registry.js';
import type {
  ActorResolveInput,
  AgentApplicationBinding,
  AgentRecord,
  AgentToolGrant,
  RuntimeActorFacts,
  ToolRecord,
} from './types.js';

function asStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((x): x is string => typeof x === 'string');
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return asStringArray(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function asObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      return asObject(JSON.parse(raw));
    } catch {
      return {};
    }
  }
  return {};
}

function mapAgent(row: Record<string, unknown>): AgentRecord {
  return {
    deployment_id: String(row.deployment_id),
    agent_id: String(row.agent_id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    status: row.status as AgentRecord['status'],
    autonomy_level: row.autonomy_level as AgentRecord['autonomy_level'],
    metadata: asObject(row.metadata),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function mapTool(row: Record<string, unknown>): ToolRecord {
  return {
    deployment_id: String(row.deployment_id),
    tool_id: String(row.tool_id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    status: row.status as ToolRecord['status'],
    operations: asStringArray(row.operations),
    metadata: asObject(row.metadata),
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function mapBinding(row: Record<string, unknown>): AgentApplicationBinding {
  return {
    deployment_id: String(row.deployment_id),
    agent_id: String(row.agent_id),
    application_id: String(row.application_id),
    status: row.status as AgentApplicationBinding['status'],
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

function mapGrant(row: Record<string, unknown>): AgentToolGrant {
  return {
    deployment_id: String(row.deployment_id),
    agent_id: String(row.agent_id),
    tool_id: String(row.tool_id),
    allowed_operations: asStringArray(row.allowed_operations),
    status: row.status as AgentToolGrant['status'],
    created_at:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at),
  };
}

export class PostgresActorRegistry implements ActorRegistry {
  constructor(private readonly db: PgQueryable) {}

  async resolve(input: ActorResolveInput): Promise<RuntimeActorFacts> {
    try {
      const agentId = input.agentId?.trim() || null;
      const toolId = input.toolId?.trim() || null;

      const result = await this.db.query(
        `SELECT
           row_to_json(a) AS agent,
           row_to_json(b) AS binding,
           row_to_json(t) AS tool,
           row_to_json(g) AS grant
         FROM (SELECT $1::text AS deployment_id, $2::text AS agent_id,
                      $3::text AS application_id, $4::text AS tool_id) AS q
         LEFT JOIN agents a
           ON a.deployment_id = q.deployment_id AND a.agent_id = q.agent_id
         LEFT JOIN agent_application_bindings b
           ON b.deployment_id = q.deployment_id
          AND b.agent_id = q.agent_id
          AND b.application_id = q.application_id
         LEFT JOIN tools t
           ON t.deployment_id = q.deployment_id AND t.tool_id = q.tool_id
         LEFT JOIN agent_tool_grants g
           ON g.deployment_id = q.deployment_id
          AND g.agent_id = q.agent_id
          AND g.tool_id = q.tool_id`,
        [
          input.deploymentId,
          agentId,
          input.applicationId,
          toolId,
        ],
      );
      const row = (result.rows[0] ?? {}) as Record<string, unknown>;
      return buildRuntimeActorFacts(input, {
        agent: row.agent
          ? mapAgent(row.agent as Record<string, unknown>)
          : null,
        binding: row.binding
          ? mapBinding(row.binding as Record<string, unknown>)
          : null,
        tool: row.tool ? mapTool(row.tool as Record<string, unknown>) : null,
        grant: row.grant
          ? mapGrant(row.grant as Record<string, unknown>)
          : null,
      });
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
    const result = await this.db.query(
      `INSERT INTO agents (
         deployment_id, agent_id, organization_id, name, status,
         autonomy_level, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       RETURNING *`,
      [
        input.deployment_id,
        input.agent_id,
        input.organization_id,
        input.name,
        input.status,
        input.autonomy_level,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return mapAgent(result.rows[0] as Record<string, unknown>);
  }

  async updateAgent(
    deploymentId: string,
    agentId: string,
    patch: Partial<
      Pick<AgentRecord, 'name' | 'status' | 'autonomy_level' | 'metadata'>
    >,
  ): Promise<AgentRecord | null> {
    const cur = await this.getAgent(deploymentId, agentId);
    if (!cur) return null;
    const next = {
      name: patch.name ?? cur.name,
      status: patch.status ?? cur.status,
      autonomy_level: patch.autonomy_level ?? cur.autonomy_level,
      metadata: patch.metadata ?? cur.metadata,
    };
    const result = await this.db.query(
      `UPDATE agents
       SET name = $3, status = $4, autonomy_level = $5,
           metadata = $6::jsonb, updated_at = now()
       WHERE deployment_id = $1 AND agent_id = $2
       RETURNING *`,
      [
        deploymentId,
        agentId,
        next.name,
        next.status,
        next.autonomy_level,
        JSON.stringify(next.metadata),
      ],
    );
    return result.rows[0]
      ? mapAgent(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async getAgent(
    deploymentId: string,
    agentId: string,
  ): Promise<AgentRecord | null> {
    const result = await this.db.query(
      `SELECT * FROM agents WHERE deployment_id = $1 AND agent_id = $2`,
      [deploymentId, agentId],
    );
    return result.rows[0]
      ? mapAgent(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async listAgents(deploymentId: string): Promise<AgentRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM agents WHERE deployment_id = $1 ORDER BY agent_id`,
      [deploymentId],
    );
    return result.rows.map((r) => mapAgent(r as Record<string, unknown>));
  }

  async createTool(
    input: Omit<ToolRecord, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<ToolRecord> {
    const result = await this.db.query(
      `INSERT INTO tools (
         deployment_id, tool_id, organization_id, name, status,
         operations, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)
       RETURNING *`,
      [
        input.deployment_id,
        input.tool_id,
        input.organization_id,
        input.name,
        input.status,
        JSON.stringify(input.operations ?? []),
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return mapTool(result.rows[0] as Record<string, unknown>);
  }

  async updateTool(
    deploymentId: string,
    toolId: string,
    patch: Partial<
      Pick<ToolRecord, 'name' | 'status' | 'operations' | 'metadata'>
    >,
  ): Promise<ToolRecord | null> {
    const cur = await this.getTool(deploymentId, toolId);
    if (!cur) return null;
    const next = {
      name: patch.name ?? cur.name,
      status: patch.status ?? cur.status,
      operations: patch.operations ?? cur.operations,
      metadata: patch.metadata ?? cur.metadata,
    };
    const result = await this.db.query(
      `UPDATE tools
       SET name = $3, status = $4, operations = $5::jsonb,
           metadata = $6::jsonb, updated_at = now()
       WHERE deployment_id = $1 AND tool_id = $2
       RETURNING *`,
      [
        deploymentId,
        toolId,
        next.name,
        next.status,
        JSON.stringify(next.operations),
        JSON.stringify(next.metadata),
      ],
    );
    return result.rows[0]
      ? mapTool(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async getTool(
    deploymentId: string,
    toolId: string,
  ): Promise<ToolRecord | null> {
    const result = await this.db.query(
      `SELECT * FROM tools WHERE deployment_id = $1 AND tool_id = $2`,
      [deploymentId, toolId],
    );
    return result.rows[0]
      ? mapTool(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async listTools(deploymentId: string): Promise<ToolRecord[]> {
    const result = await this.db.query(
      `SELECT * FROM tools WHERE deployment_id = $1 ORDER BY tool_id`,
      [deploymentId],
    );
    return result.rows.map((r) => mapTool(r as Record<string, unknown>));
  }

  async upsertBinding(
    input: Omit<AgentApplicationBinding, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<AgentApplicationBinding> {
    const result = await this.db.query(
      `INSERT INTO agent_application_bindings (
         deployment_id, agent_id, application_id, status
       ) VALUES ($1,$2,$3,$4)
       ON CONFLICT (deployment_id, agent_id, application_id)
       DO UPDATE SET status = EXCLUDED.status, updated_at = now()
       RETURNING *`,
      [
        input.deployment_id,
        input.agent_id,
        input.application_id,
        input.status,
      ],
    );
    return mapBinding(result.rows[0] as Record<string, unknown>);
  }

  async getBinding(
    deploymentId: string,
    agentId: string,
    applicationId: string,
  ): Promise<AgentApplicationBinding | null> {
    const result = await this.db.query(
      `SELECT * FROM agent_application_bindings
       WHERE deployment_id = $1 AND agent_id = $2 AND application_id = $3`,
      [deploymentId, agentId, applicationId],
    );
    return result.rows[0]
      ? mapBinding(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async upsertGrant(
    input: Omit<AgentToolGrant, 'created_at' | 'updated_at'> & {
      created_at?: string;
      updated_at?: string;
    },
  ): Promise<AgentToolGrant> {
    const result = await this.db.query(
      `INSERT INTO agent_tool_grants (
         deployment_id, agent_id, tool_id, allowed_operations, status
       ) VALUES ($1,$2,$3,$4::jsonb,$5)
       ON CONFLICT (deployment_id, agent_id, tool_id)
       DO UPDATE SET
         allowed_operations = EXCLUDED.allowed_operations,
         status = EXCLUDED.status,
         updated_at = now()
       RETURNING *`,
      [
        input.deployment_id,
        input.agent_id,
        input.tool_id,
        JSON.stringify(input.allowed_operations ?? []),
        input.status,
      ],
    );
    return mapGrant(result.rows[0] as Record<string, unknown>);
  }

  async getGrant(
    deploymentId: string,
    agentId: string,
    toolId: string,
  ): Promise<AgentToolGrant | null> {
    const result = await this.db.query(
      `SELECT * FROM agent_tool_grants
       WHERE deployment_id = $1 AND agent_id = $2 AND tool_id = $3`,
      [deploymentId, agentId, toolId],
    );
    return result.rows[0]
      ? mapGrant(result.rows[0] as Record<string, unknown>)
      : null;
  }

  async listBindingsForAgent(
    deploymentId: string,
    agentId: string,
  ): Promise<AgentApplicationBinding[]> {
    const result = await this.db.query(
      `SELECT * FROM agent_application_bindings
       WHERE deployment_id = $1 AND agent_id = $2
       ORDER BY application_id`,
      [deploymentId, agentId],
    );
    return result.rows.map((r) =>
      mapBinding(r as Record<string, unknown>),
    );
  }

  async listGrantsForAgent(
    deploymentId: string,
    agentId: string,
  ): Promise<AgentToolGrant[]> {
    const result = await this.db.query(
      `SELECT * FROM agent_tool_grants
       WHERE deployment_id = $1 AND agent_id = $2
       ORDER BY tool_id`,
      [deploymentId, agentId],
    );
    return result.rows.map((r) => mapGrant(r as Record<string, unknown>));
  }

  async listGrantsForTool(
    deploymentId: string,
    toolId: string,
  ): Promise<AgentToolGrant[]> {
    const result = await this.db.query(
      `SELECT * FROM agent_tool_grants
       WHERE deployment_id = $1 AND tool_id = $2
       ORDER BY agent_id`,
      [deploymentId, toolId],
    );
    return result.rows.map((r) => mapGrant(r as Record<string, unknown>));
  }
}
