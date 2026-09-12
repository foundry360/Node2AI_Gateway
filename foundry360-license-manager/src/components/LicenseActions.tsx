'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  licenseId: string;
  dbId: string;
  status: string;
  customerName: string;
  deploymentId: string;
  deploymentType: string;
  validFrom: string;
  validUntil: string;
  graceDays: number;
  isAdmin: boolean;
};

export function LicenseActions(props: Props) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);

  if (!props.isAdmin) return null;

  async function issue() {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/licenses/${props.dbId}/issue`, { method: 'POST' });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || 'Issue failed');
      return;
    }
    setConfirmIssue(false);
    router.refresh();
  }

  async function download() {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/licenses/${props.dbId}/download`);
    if (!res.ok) {
      const data = await res.json();
      setBusy(false);
      setError(data.message || 'Download failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'enigma.license';
    a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
    router.refresh();
  }

  async function renew(fd: FormData) {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/licenses/${props.dbId}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseId: fd.get('licenseId'),
        validFrom: fd.get('validFrom'),
        validUntil: fd.get('validUntil'),
        graceDays: Number(fd.get('graceDays') || props.graceDays),
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || 'Renewal failed');
      return;
    }
    router.push(`/licenses/${data.license.id}`);
  }

  async function revoke(fd: FormData) {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/licenses/${props.dbId}/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: fd.get('reason') }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || 'Revoke failed');
      return;
    }
    setRevokeOpen(false);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {props.status === 'DRAFT' && (
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setConfirmIssue(true)}
          >
            Review & Issue
          </button>
        )}
        {(props.status === 'ISSUED' || props.status === 'SUPERSEDED') && (
          <button type="button" className="btn" disabled={busy} onClick={download}>
            Download enigma.license
          </button>
        )}
        {(props.status === 'ISSUED' || props.status === 'REVOKED') && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setRenewOpen(true)}
          >
            Renew License
          </button>
        )}
        {(props.status === 'ISSUED' || props.status === 'SUPERSEDED') && (
          <button
            type="button"
            className="btn btn-danger"
            disabled={busy}
            onClick={() => setRevokeOpen(true)}
          >
            Revoke
          </button>
        )}
      </div>
      {error && <p className="text-sm text-rose-700">{error}</p>}

      {confirmIssue && (
        <div className="card border-line bg-slate-50 p-5">
          <h3 className="font-semibold text-ink">You are about to issue this license:</h3>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted">Customer</dt>
              <dd className="font-semibold">{props.customerName}</dd>
            </div>
            <div>
              <dt className="text-muted">License ID</dt>
              <dd className="mono font-semibold">{props.licenseId}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted">Deployment ID</dt>
              <dd className="mono break-all">{props.deploymentId}</dd>
            </div>
            <div>
              <dt className="text-muted">Deployment Type</dt>
              <dd>{props.deploymentType}</dd>
            </div>
            <div>
              <dt className="text-muted">Grace Days</dt>
              <dd>{props.graceDays}</dd>
            </div>
            <div>
              <dt className="text-muted">Valid From</dt>
              <dd>{props.validFrom}</dd>
            </div>
            <div>
              <dt className="text-muted">Valid Until</dt>
              <dd>{props.validUntil}</dd>
            </div>
          </dl>
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn" disabled={busy} onClick={issue}>
              Issue & Sign License
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setConfirmIssue(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {renewOpen && (
        <form
          className="card space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void renew(new FormData(e.currentTarget));
          }}
        >
          <h3 className="font-semibold">Renew License</h3>
          <label className="field">
            New License ID
            <input name="licenseId" className="mono" required />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="field">
              Valid From
              <input name="validFrom" type="date" required />
            </label>
            <label className="field">
              Valid Until
              <input name="validUntil" type="date" required />
            </label>
          </div>
          <label className="field">
            Grace Days
            <input
              name="graceDays"
              type="number"
              defaultValue={props.graceDays}
              min={0}
              max={3650}
            />
          </label>
          <div className="flex gap-2">
            <button className="btn" type="submit" disabled={busy}>
              Issue Renewal
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRenewOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {revokeOpen && (
        <form
          className="card space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void revoke(new FormData(e.currentTarget));
          }}
        >
          <h3 className="font-semibold">Revoke License</h3>
          <label className="field">
            Revocation reason
            <textarea name="reason" rows={3} required minLength={3} />
          </label>
          <div className="flex gap-2">
            <button className="btn btn-danger" type="submit" disabled={busy}>
              Confirm Revoke
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setRevokeOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
