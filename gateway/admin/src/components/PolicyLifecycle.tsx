'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { proxyJson } from '@/lib/client-api';
import { DecisionExplanationView } from '@/components/DecisionExplanationView';
import type { DecisionExplanationPayload } from '@/lib/decision-explanation';

export function PolicyLifecycleActions({
  policyId,
  status,
}: {
  policyId: string;
  status: string;
}) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [validateResult, setValidateResult] = useState<Record<string, unknown> | null>(
    null,
  );

  const canApprove = ['draft', 'review', 'suspended', 'active', 'approved'].includes(
    status,
  );
  const canActivate = status === 'approved' || status === 'active';
  const canSuspend = status === 'active' || status === 'approved';
  const canRetire = status === 'suspended' || status === 'disabled' || status === 'draft';

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setOpen(false);
    setError(null);
    setInfo(null);
    try {
      const result = await fn();
      setInfo(`${label} succeeded`);
      router.refresh();
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      return null;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-tight policy-lifecycle-actions">
      <div className="card-menu" ref={rootRef}>
        <button
          type="button"
          className="icon-btn overflow-menu-trigger"
          aria-label="Policy actions"
          aria-expanded={open}
          disabled={busy}
          onClick={() => setOpen((v) => !v)}
        >
          <MoreHorizontal size={18} strokeWidth={1.75} />
        </button>
        {open ? (
          <div className="card-menu-dropdown" role="menu">
            <button
              type="button"
              role="menuitem"
              disabled={busy}
              onClick={async () => {
                const result = (await run('Validate', () =>
                  proxyJson(`policies/${policyId}/validate`, 'POST', {}),
                )) as Record<string, unknown> | null;
                if (result) setValidateResult(result);
              }}
            >
              Validate
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy || !canApprove || status === 'retired'}
              onClick={() =>
                run('Approve', () =>
                  proxyJson(`policies/${policyId}/approve`, 'POST', {}),
                )
              }
            >
              Approve
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy || !canActivate}
              onClick={() =>
                run('Activate', () =>
                  proxyJson(`policies/${policyId}/activate`, 'POST', {}),
                )
              }
            >
              Activate
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={busy || !canSuspend}
              onClick={() =>
                run('Suspend', () =>
                  proxyJson(`policies/${policyId}/suspend`, 'POST', {}),
                )
              }
            >
              Suspend
            </button>
            <button
              type="button"
              role="menuitem"
              className="card-menu-item-danger"
              disabled={busy || !canRetire}
              onClick={() =>
                run('Retire', () =>
                  proxyJson(`policies/${policyId}/retire`, 'POST', {}),
                )
              }
            >
              Retire
            </button>
          </div>
        ) : null}
      </div>
      {validateResult ? (
        <div className="info-banner">
          Validate: {validateResult.ok ? 'ok' : 'failed'}
          {Array.isArray(validateResult.errors) && validateResult.errors.length
            ? ` - ${(validateResult.errors as string[]).join('; ')}`
            : ''}
        </div>
      ) : null}
      {info ? <div className="info-banner">{info}</div> : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

/** Fixture presets - data only; UI remains pack-agnostic. */
const SIM_SCENARIOS: Array<{
  id: string;
  label: string;
  body: Record<string, unknown>;
}> = [
  {
    id: 'default',
    label: 'Default (classification + model)',
    body: {},
  },
  {
    id: 'agreement_deny',
    label: 'Multi-pack agreement (write / both deny)',
    body: {
      classification: 'PHI',
      action: 'write',
      requested_model: 'local-general-v1',
      regulatory_applicability: ['HIPAA', 'PART2'],
      purpose: 'treatment',
      application_type: 'clinical',
      roles: ['clinician'],
    },
  },
  {
    id: 'complementary',
    label: 'Multi-pack complementary (allow + controls)',
    body: {
      classification: 'PHI',
      action: 'summarize',
      requested_model: 'local-general-v1',
      regulatory_applicability: ['HIPAA', 'PART2'],
      purpose: 'treatment',
      authorization_context: 'part2_consent',
      application_type: 'clinical',
      roles: ['clinician'],
    },
  },
  {
    id: 'restrictive',
    label: 'Multi-pack restrictive (unknown consent)',
    body: {
      classification: 'PHI',
      action: 'summarize',
      requested_model: 'local-general-v1',
      regulatory_applicability: ['HIPAA', 'PART2'],
      purpose: 'treatment',
      authorization_context: 'unknown',
      application_type: 'clinical',
      roles: ['clinician'],
    },
  },
  {
    id: 'unresolved',
    label: 'Multi-pack unresolved conflict → REVIEW',
    body: {
      classification: 'PHI',
      action: 'summarize',
      requested_model: 'local-general-v1',
      regulatory_applicability: ['HIPAA', 'PART2'],
      purpose: 'treatment',
      application_type: 'clinical',
      roles: ['clinician'],
    },
  },
];

export function PolicySimulatePanel({ policyId }: { policyId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [simClass, setSimClass] = useState('PHI');
  const [simModel, setSimModel] = useState('cloud-public-gpt');
  const [scenarioId, setScenarioId] = useState('default');
  const [simResult, setSimResult] = useState<DecisionExplanationPayload | null>(null);

  return (
    <div className="stack-tight">
      <p className="muted">
        What-if evaluation against the pack-backed PDP. Explains the machine decision, contributing
        policies, resolution, provenance, and Enigma controls. No model is executed; enforcement is
        NOT_EXECUTED.
      </p>
      <div className="form-grid" style={{ padding: 0 }}>
        <label>
          Scenario
          <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
            {SIM_SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {scenarioId === 'default' ? (
          <>
            <label>
              Classification
              <select value={simClass} onChange={(e) => setSimClass(e.target.value)}>
                <option value="Internal">Internal</option>
                <option value="PII">PII</option>
                <option value="PHI">PHI</option>
                <option value="Credential">Credential</option>
                <option value="FINANCIAL">FINANCIAL</option>
                <option value="LEGAL">LEGAL</option>
                <option value="PART2">PART2</option>
              </select>
            </label>
            <label>
              Requested model
              <select value={simModel} onChange={(e) => setSimModel(e.target.value)}>
                <option value="local-general-v1">local-general-v1</option>
                <option value="cloud-public-gpt">cloud-public-gpt</option>
              </select>
            </label>
          </>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const scenario = SIM_SCENARIOS.find((s) => s.id === scenarioId);
              const body =
                scenarioId === 'default'
                  ? {
                      classification: simClass,
                      requested_model: simModel,
                      application_type: 'clinical',
                      roles: ['clinician'],
                    }
                  : {
                      application_type: 'clinical',
                      roles: ['clinician'],
                      ...(scenario?.body ?? {}),
                    };
              const result = (await proxyJson(`policies/${policyId}/simulate`, 'POST', body)) as {
                decision?: DecisionExplanationPayload;
              };
              setSimResult(result.decision ?? null);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed');
            } finally {
              setBusy(false);
            }
          }}
        >
          Run simulation
        </button>
      </div>
      {simResult ? (
        <div className="stack-tight">
          {simResult.evaluation_id ? (
            <p className="muted">
              Recorded as decision{' '}
              <Link href={`/evaluations/${simResult.evaluation_id}`} className="table-link">
                {simResult.evaluation_id}
              </Link>
            </p>
          ) : null}
          <DecisionExplanationView decision={simResult} />
        </div>
      ) : null}
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}

/** @deprecated Legacy rules JSON editor - metadata only, not EPA architecture. */
export function LegacyRulesEditor({
  policyId,
  rulesJson,
}: {
  policyId: string;
  rulesJson: string;
}) {
  const router = useRouter();
  const [rules, setRules] = useState(rulesJson);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => setOpen(true)}
      >
        Show deprecated rules JSON
      </button>
    );
  }

  return (
    <div className="stack-tight">
      <p className="muted">
        Deprecated: rules JSON is operator metadata only. Binding decisions come from
        Enigma policy packs / PDP.
      </p>
      <label>
        Rules JSON (saves as new legacy store version)
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          rows={6}
          className="mono"
        />
      </label>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={async () => {
          setError(null);
          try {
            const parsed = JSON.parse(rules);
            await proxyJson(`policies/${policyId}`, 'PATCH', { rules: parsed });
            router.refresh();
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Invalid JSON');
          }
        }}
      >
        Save legacy metadata version
      </button>
      {error ? <div className="error">{error}</div> : null}
    </div>
  );
}
