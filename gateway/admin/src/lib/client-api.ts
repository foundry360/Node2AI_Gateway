export async function proxyJson(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api/proxy/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { message?: string }).message ?? `Request failed (${res.status})`,
    );
  }
  return data;
}
