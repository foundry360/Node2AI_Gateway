'use client';

/**
 * Historical runtime actor substrate from evaluation ai_context.
 * Must not look up current Agent/Tool registry state.
 */

import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/StatusBadge';

export type RuntimeActorSnapshot = {
  mode?: string;
  agent?: {
    id?: string;
    name?: string | null;
    registered?: boolean;
    status?: string | null;
    bound_to_application?: boolean;
    autonomy_level?: string | null;
    authorized?: boolean;
  } | null;
  tool?: {
    id?: string;
    name?: string | null;
    registered?: boolean;
    status?: string | null;
    granted_to_agent?: boolean;
    operation?: string | null;
    operation_declared?: boolean;
    operation_granted?: boolean;
    authorized?: boolean;
  } | null;
  substrate?: {
    agent_authorized?: boolean | null;
    tool_authorized?: boolean | null;
    reason_codes?: string[];
  };
  mismatch?: boolean;
  registry_error?: string | null;
  client_attested?: {
    agent_authorized?: boolean;
    tool_authorized?: boolean;
  };
};

function AttrRow({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="meridian-attr">
      <span className="meridian-attr-label">{label}</span>
      <span className={mono ? 'meridian-attr-value mono' : 'meridian-attr-value'}>
        {children}
      </span>
    </div>
  );
}

function authLabel(authorized: boolean | null | undefined): {
  status: string;
  label: string;
} {
  if (authorized === true) return { status: 'AUTHORIZED', label: 'Authorized' };
  if (authorized === false) return { status: 'DENIED', label: 'Denied' };
  return { status: 'UNKNOWN', label: 'Not recorded' };
}

export function DecisionRuntimeActorPanel({
  runtimeActor,
}: {
  runtimeActor: RuntimeActorSnapshot;
}) {
  const agent = runtimeActor.agent;
  const tool = runtimeActor.tool;
  const reasons = runtimeActor.substrate?.reason_codes ?? [];
  const agentAuth = authLabel(
    agent?.authorized ?? runtimeActor.substrate?.agent_authorized,
  );
  const toolAuth = authLabel(
    tool?.authorized ?? runtimeActor.substrate?.tool_authorized,
  );
  const overallAuth =
    tool != null
      ? toolAuth
      : agent != null
        ? agentAuth
        : authLabel(null);

  return (
    <section
      className="section-card consequence-card"
      aria-labelledby="runtime-actor-heading"
    >
      <div className="section-card-header">
        <h3 id="runtime-actor-heading">Runtime Actor</h3>
      </div>
      <p className="muted decision-panel-lede">
        Actor facts from the historical evaluation snapshot
        (ai_context.runtime_actor). Not reconstructed from the current registry.
      </p>
      <div className="contribution-attrs">
        {agent ? (
          <>
            <AttrRow label="Agent">
              {agent.name ?? agent.id ?? <span className="muted">—</span>}
            </AttrRow>
            {agent.id ? (
              <AttrRow label="Agent ID" mono>
                {agent.id}
              </AttrRow>
            ) : null}
            <AttrRow label="Agent Status">
              {agent.status ? (
                <StatusBadge showLabel status={String(agent.status)} />
              ) : (
                <span className="muted">—</span>
              )}
            </AttrRow>
            {agent.bound_to_application != null ? (
              <AttrRow label="Application Bound">
                {agent.bound_to_application ? 'Yes' : 'No'}
              </AttrRow>
            ) : null}
          </>
        ) : (
          <AttrRow label="Agent">
            <span className="muted">Not present on this evaluation</span>
          </AttrRow>
        )}
        {tool ? (
          <>
            <AttrRow label="Tool">
              {tool.name ?? tool.id ?? <span className="muted">—</span>}
            </AttrRow>
            {tool.id ? (
              <AttrRow label="Tool ID" mono>
                {tool.id}
              </AttrRow>
            ) : null}
            <AttrRow label="Operation" mono>
              {tool.operation ?? <span className="muted">—</span>}
            </AttrRow>
            {tool.status ? (
              <AttrRow label="Tool Status">
                <StatusBadge showLabel status={String(tool.status)} />
              </AttrRow>
            ) : null}
          </>
        ) : null}
        <AttrRow label="Authorization">
          <StatusBadge
            variant="badge"
            status={overallAuth.status}
            label={overallAuth.label}
          />
        </AttrRow>
        {reasons.length > 0 ? (
          <AttrRow label="Reason" mono>
            {reasons.join(', ')}
          </AttrRow>
        ) : null}
        {runtimeActor.mode ? (
          <AttrRow label="Registry Mode" mono>
            {runtimeActor.mode}
          </AttrRow>
        ) : null}
        {runtimeActor.mismatch ? (
          <AttrRow label="Client Mismatch">
            <span>Client attestation differed from server facts</span>
          </AttrRow>
        ) : null}
        {runtimeActor.registry_error ? (
          <AttrRow label="Registry Error" mono>
            {runtimeActor.registry_error}
          </AttrRow>
        ) : null}
      </div>
    </section>
  );
}
