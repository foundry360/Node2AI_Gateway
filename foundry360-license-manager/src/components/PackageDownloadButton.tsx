'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function PackageDownloadButton({
  releaseId,
  artifactId,
  fileName,
  label = 'Download',
}: {
  releaseId: string;
  artifactId: string;
  fileName: string;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onClick() {
    setBusy(true);
    setError('');
    const res = await fetch(
      `/api/releases/${releaseId}/artifacts/${artifactId}/download`,
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setBusy(false);
      setError(data.message || 'Download failed');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setBusy(false);
    router.refresh();
  }

  return (
    <div>
      <button type="button" className="btn" disabled={busy} onClick={onClick}>
        {busy ? 'Downloading…' : label}
      </button>
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
    </div>
  );
}
