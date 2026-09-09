export async function proxyJson(path: string, method: string, body?: unknown) {
  const res = await fetch(`/api/proxy/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const payload = data as { message?: string; reason_code?: string };
    throw new Error(
      payload.message ??
        payload.reason_code ??
        `Request failed (${res.status})`,
    );
  }
  return data;
}
