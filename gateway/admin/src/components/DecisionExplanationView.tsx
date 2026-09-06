'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { formatReasonCodes } from '@/lib/reason-codes';
import {
  authorityTierLabel,
  type DecisionExplanationPayload,
  type ProvenanceRule,
} from '@/lib/decision-explanation';

function CodeList({ items, empty = 'None' }: { items: string[]; empty?: string }) {
  if (!items.length) return <span className="muted">{empty}</span>;
  return (
    <ul className="decision-code-list">
      {items.map((item) => (
        <li key={item} className="mono">
          {item}
        </li>
      ))}
    </ul>
  );
}

function DecisionFlow({ steps }: { steps: string[] }) {
  if (!steps.length) return null;
  return (
    <ol className="decision-flow" aria-label="Decision flow">
      {steps.map((step, i) => (
        <li key={step}>
          <span className="decision-flow-step">{step.replace(/_/g, ' ')}</span>
          {i < steps.length - 1 ? <span className="decision-flow-arrow" aria-hidden>↓</span> : null}
        </li>
      ))}
    </ol>
  );
}

function ProvenanceChain({ rule }: { rule: ProvenanceRule }) {
  return (
    <div className="provenance-chain">
      <dl className="definition-list compact">
        <div>
          <dt>Rule</dt>
          <dd className="mono">{rule.rule_id}</dd>
        </div>
        <div>
          <dt>Obligations</dt>
          <dd>
            <CodeList items={rule.obligation_ids} empty="—" />
          </dd>
        </div>
        <div>
          <dt>Citations</dt>
          <dd>
            <CodeList items={rule.citations} empty="—" />
          </dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>
            <CodeList items={rule.source_ids} empty="—" />
          </dd>
        </div>
        <div>
          <dt>Authority tier</dt>
          <dd>{authorityTierLabel(rule.authority_tier)}</dd>
        </div>
        {rule.authority ? (
          <div>
            <dt>Authority</dt>
            <dd>{rule.authority}</dd>
          </div>
        ) : null}
        {rule.control_ids?.length ? (
          <div>
            <dt>Mapped controls</dt>
            <dd>
              <CodeList items={rule.control_ids} />
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

/**
 * Pack-agnostic decision intelligence panel.
 * Renders structured PolicyDecision explanation — no regulatory forks.
 */
export function DecisionExplanationView({
  decision,
}: {
  decision: DecisionExplanationPayload;
}) {
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const operator = decision.explanation?.operator;
  const resolution = decision.explanation?.resolution;
  const provenance = decision.explanation?.provenance;
  const machineDecision = operator?.final_decision ?? decision.decision ?? '—';
  const narrative =
    operator?.narrative ??
    decision.explanation?.final_reason ??
    decision.reason ??
    '';
  const contributions = operator?.contributions ?? [];
  const authorities = operator?.authorities ?? provenance?.sources?.map((s) => ({
    source_id: s.source_id,
    authority: s.authority,
    citation: s.citation,
    authority_tier: s.authority_tier,
    authority_type: s.authority_type,
    legal_authority: s.legal_authority,
    pack_ids: [] as string[],
  })) ?? [];
  const flow = (operator?.flow ?? [
    'REQUEST',
    'CLASSIFICATION',
    'POLICY_EVALUATION',
    'MACHINE_DECISION',
    'GATEWAY_ENFORCEMENT',
  ]).map((step) => (step === 'FINAL_DECISION' ? 'MACHINE_DECISION' : step));
  const enigmaControls = operator?.enigma_obligations ??
    (decision.obligations ?? []).map((o) => o.code);
  const enforcementActions = operator?.enforcement_actions ??
    provenance?.enforcement?.actions ??
    [];
  const enforcementControls = operator?.enforcement_controls ??
    provenance?.controls ??
    [];

  // Group provenance rules under contributions when possible
  const allRules = provenance?.matched_rules ?? [];

  return (
    <div className="decision-explanation stack-tight">
      <section className="decision-summary panel-pad panel" aria-labelledby="machine-decision-heading">
        <p className="muted eyebrow">Machine decision</p>
        <div className="decision-hero">
          <h2 id="machine-decision-heading" className="decision-hero-value">
            {machineDecision}
          </h2>
          <StatusBadge variant="badge" status={machineDecision} />
        </div>
        <p className="muted" style={{ marginTop: '0.35rem' }}>
          Policy evaluation outcome. Distinct from human resolution and final enforceable decision
          when review applies.
        </p>
        {(operator?.resolution_label || resolution?.category) && (
          <div className="decision-row">
            <strong>Resolution</strong>
            <span>{operator?.resolution_label ?? resolution?.category}</span>
          </div>
        )}
        {narrative ? <p className="decision-narrative">{narrative}</p> : null}
        {decision.reason_codes?.length ? (
          <div>
            <div className="muted" style={{ marginBottom: '0.35rem' }}>
              Reason codes
            </div>
            <div>{formatReasonCodes(decision.reason_codes)}</div>
          </div>
        ) : null}
      </section>

      <section className="panel panel-pad" aria-labelledby="decision-flow-heading">
        <h3 id="decision-flow-heading" className="section-title">
          Decision flow
        </h3>
        <DecisionFlow steps={flow} />
      </section>

      {contributions.length > 0 ? (
        <section className="panel panel-pad" aria-labelledby="contributions-heading">
          <h3 id="contributions-heading" className="section-title">
            Policy contributions
          </h3>
          <div className="contribution-grid">
            {contributions.map((c) => {
              const rules =
                c.rule_ids.length > 0
                  ? allRules.filter((r) => c.rule_ids.includes(r.rule_id))
                  : [];
              return (
                <article key={`${c.pack_id}-${c.policy_id}`} className="contribution-card">
                  <header className="contribution-header">
                    <div>
                      <strong>{c.pack_name}</strong>
                      {c.pack_version ? (
                        <span className="muted"> v{c.pack_version}</span>
                      ) : null}
                    </div>
                    <StatusBadge variant="badge" status={c.decision} />
                  </header>
                  <dl className="definition-list compact">
                    <div>
                      <dt>Policy</dt>
                      <dd>
                        {c.policy_name ?? c.policy_id}
                        {c.policy_version != null ? (
                          <span className="muted"> · v{c.policy_version}</span>
                        ) : null}
                      </dd>
                    </div>
                    <div>
                      <dt>Rules</dt>
                      <dd>
                        <CodeList items={c.rule_ids} empty="—" />
                      </dd>
                    </div>
                    <div>
                      <dt>Regulatory obligations</dt>
                      <dd>
                        <CodeList
                          items={
                            c.obligation_ids.length
                              ? c.obligation_ids
                              : c.obligations
                          }
                          empty="—"
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>Enigma controls</dt>
                      <dd>
                        <CodeList
                          items={
                            c.controls.map((x) => x.control_id).length
                              ? c.controls.map((x) => x.control_id)
                              : c.obligations
                          }
                          empty="—"
                        />
                      </dd>
                    </div>
                    <div>
                      <dt>Provenance</dt>
                      <dd>{c.has_provenance || rules.length ? 'Available' : 'Not attached'}</dd>
                    </div>
                  </dl>
                  {rules.length > 0 ? (
                    <div className="contribution-provenance">
                      {rules.map((r) => (
                        <ProvenanceChain key={r.rule_id} rule={r} />
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {resolution || operator?.resolution_category ? (
        <section className="panel panel-pad" aria-labelledby="resolution-heading">
          <h3 id="resolution-heading" className="section-title">
            Resolution
          </h3>
          <dl className="definition-list">
            <div>
              <dt>Category</dt>
              <dd className="mono">
                {operator?.resolution_category ?? resolution?.category ?? '—'}
              </dd>
            </div>
            <div>
              <dt>Basis</dt>
              <dd>
                {operator?.basis_label ?? resolution?.basis ?? '—'}
                {resolution?.basis ? (
                  <div className="muted mono" style={{ marginTop: '0.25rem' }}>
                    {resolution.basis}
                  </div>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Contributing packs</dt>
              <dd>
                <CodeList
                  items={
                    operator?.contributing_pack_ids ??
                    resolution?.contributing_pack_ids ??
                    []
                  }
                />
              </dd>
            </div>
            {(operator?.conflict_detail || resolution?.detail) && (
              <div>
                <dt>Detail</dt>
                <dd>{operator?.conflict_detail ?? resolution?.detail}</dd>
              </div>
            )}
          </dl>
          {resolution?.conflict_pairs?.length ? (
            <div style={{ marginTop: '0.75rem' }}>
              <div className="muted" style={{ marginBottom: '0.35rem' }}>
                Conflict pairs
              </div>
              <ul className="decision-code-list">
                {resolution.conflict_pairs.map((p, i) => (
                  <li key={`${p.pack_a}-${p.pack_b}-${i}`}>
                    <span className="mono">
                      {p.pack_a} ({p.policy_a}) vs {p.pack_b} ({p.policy_b})
                    </span>
                    <span className="muted"> — {p.category}: {p.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {authorities.length > 0 ? (
        <section className="panel panel-pad" aria-labelledby="authorities-heading">
          <h3 id="authorities-heading" className="section-title">
            Contributing authorities
          </h3>
          <div className="authority-grid">
            {authorities.map((a) => (
              <article key={a.source_id} className="authority-card">
                <strong>{a.authority}</strong>
                {a.citation ? <div className="mono muted">{a.citation}</div> : null}
                <dl className="definition-list compact">
                  <div>
                    <dt>Source</dt>
                    <dd className="mono">{a.source_id}</dd>
                  </div>
                  <div>
                    <dt>Authority tier</dt>
                    <dd>{authorityTierLabel(a.authority_tier)}</dd>
                  </div>
                  {a.legal_authority != null ? (
                    <div>
                      <dt>Legal authority</dt>
                      <dd>{a.legal_authority ? 'Yes' : 'No'}</dd>
                    </div>
                  ) : null}
                </dl>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel panel-pad" aria-labelledby="enforcement-heading">
        <h3 id="enforcement-heading" className="section-title">
          Enforcement
        </h3>
        <p className="muted">
          Enigma controls are implementation mechanisms. They are not themselves regulatory
          requirements.
        </p>
        <dl className="definition-list">
          <div>
            <dt>Enigma controls / obligations</dt>
            <dd>
              <CodeList items={enigmaControls} />
            </dd>
          </div>
          {enforcementControls.length > 0 ? (
            <div>
              <dt>Control references</dt>
              <dd>
                <CodeList items={enforcementControls.map((c) => c.control_id)} />
              </dd>
            </div>
          ) : null}
          {enforcementActions.length > 0 ? (
            <div>
              <dt>Gateway enforcement actions</dt>
              <dd>
                <CodeList items={enforcementActions} />
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section className="panel panel-pad" aria-labelledby="evidence-heading">
        <div className="decision-row" style={{ justifyContent: 'space-between' }}>
          <h3 id="evidence-heading" className="section-title" style={{ margin: 0 }}>
            Evidence
          </h3>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setEvidenceOpen((v) => !v)}
            aria-expanded={evidenceOpen}
          >
            {evidenceOpen ? 'Hide evidence' : 'Show evidence'}
          </button>
        </div>
        {evidenceOpen ? (
          <div className="stack-tight" style={{ marginTop: '0.75rem' }}>
            {allRules.length === 0 ? (
              <p className="muted">No provenance rules attached to this evaluation.</p>
            ) : (
              allRules.map((r) => <ProvenanceChain key={r.rule_id} rule={r} />)
            )}
            {decision.evaluation_id ? (
              <p className="muted mono">evaluation_id: {decision.evaluation_id}</p>
            ) : null}
          </div>
        ) : (
          <p className="muted" style={{ marginTop: '0.5rem' }}>
            Expand to inspect Rule → Obligation → Citation → Source → Authority tier for each
            matched rule.
          </p>
        )}
      </section>
    </div>
  );
}
