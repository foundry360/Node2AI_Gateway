-- Phase A: First-class Agent and Tool governance (authorization substrate).
-- Deployment-scoped. Not a second PDP. Not an evidence ledger.

CREATE TABLE IF NOT EXISTS agents (
  deployment_id     TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  name              TEXT NOT NULL,
  status            TEXT NOT NULL
                      CHECK (status IN ('ACTIVE', 'SUSPENDED', 'RETIRED')),
  autonomy_level    TEXT NOT NULL
                      CHECK (autonomy_level IN ('ASSISTIVE', 'HUMAN_APPROVED', 'AUTONOMOUS')),
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, agent_id)
);

CREATE INDEX IF NOT EXISTS agents_org_idx
  ON agents (deployment_id, organization_id);

CREATE TABLE IF NOT EXISTS tools (
  deployment_id     TEXT NOT NULL,
  tool_id           TEXT NOT NULL,
  organization_id   TEXT NOT NULL REFERENCES organizations(organization_id),
  name              TEXT NOT NULL,
  status            TEXT NOT NULL
                      CHECK (status IN ('ACTIVE', 'SUSPENDED', 'RETIRED')),
  operations        JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, tool_id)
);

CREATE INDEX IF NOT EXISTS tools_org_idx
  ON tools (deployment_id, organization_id);

CREATE TABLE IF NOT EXISTS agent_application_bindings (
  deployment_id     TEXT NOT NULL,
  agent_id          TEXT NOT NULL,
  application_id    TEXT NOT NULL REFERENCES applications(application_id),
  status            TEXT NOT NULL
                      CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, agent_id, application_id),
  FOREIGN KEY (deployment_id, agent_id)
    REFERENCES agents (deployment_id, agent_id)
);

CREATE INDEX IF NOT EXISTS agent_app_bindings_app_idx
  ON agent_application_bindings (deployment_id, application_id);

CREATE TABLE IF NOT EXISTS agent_tool_grants (
  deployment_id       TEXT NOT NULL,
  agent_id            TEXT NOT NULL,
  tool_id             TEXT NOT NULL,
  allowed_operations  JSONB NOT NULL DEFAULT '[]'::jsonb,
  status              TEXT NOT NULL
                        CHECK (status IN ('ACTIVE', 'REVOKED')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (deployment_id, agent_id, tool_id),
  FOREIGN KEY (deployment_id, agent_id)
    REFERENCES agents (deployment_id, agent_id),
  FOREIGN KEY (deployment_id, tool_id)
    REFERENCES tools (deployment_id, tool_id)
);

CREATE INDEX IF NOT EXISTS agent_tool_grants_tool_idx
  ON agent_tool_grants (deployment_id, tool_id);
