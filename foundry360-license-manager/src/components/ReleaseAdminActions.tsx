'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function ReleaseAdminActions({
  releaseId,
  status,
  hasArtifacts,
}: {
  releaseId: string;
  status: string;
  hasArtifacts: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function approve() {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/releases/${releaseId}/approve`, { method: 'POST' });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || 'Approve failed');
      return;
    }
    router.refresh();
  }

  async function deprecate() {
    setBusy(true);
    setError('');
    const res = await fetch(`/api/releases/${releaseId}/deprecate`, { method: 'POST' });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.message || 'Deprecate failed');
      return;
    }
    router.refresh();
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploadError('');
    setBusy(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const res = await fetch(`/api/releases/${releaseId}/artifacts`, {
      method: 'POST',
      body: fd,
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setUploadError(data.message || 'Upload failed');
      return;
    }
    form.reset();
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {status === 'DRAFT' && (
        <>
          <form className="card space-y-3 p-5" onSubmit={upload}>
            <h2 className="font-semibold">Upload deployment package</h2>
            <label className="field">
              Deployment type
              <select name="deploymentType" required defaultValue="VPC">
                <option value="VPC">VPC</option>
                <option value="AIR_GAPPED">AIR_GAPPED</option>
              </select>
            </label>
            <label className="field">
              Package file (.tar.gz)
              <input name="file" type="file" accept=".gz,.tgz,application/gzip" required />
            </label>
            {uploadError && <p className="text-sm text-rose-700">{uploadError}</p>}
            <button className="btn" type="submit" disabled={busy}>
              Upload package
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn"
              disabled={busy || !hasArtifacts}
              onClick={approve}
            >
              Approve Release
            </button>
          </div>
        </>
      )}

      {status === 'APPROVED' && (
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={deprecate}>
          Deprecate Release
        </button>
      )}

      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
