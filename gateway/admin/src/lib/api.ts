const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8080';
const ADMIN_KEY = process.env.GATEWAY_ADMIN_API_KEY ?? 'n2ai_admin_dev_key';

export async function adminFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    headers: {
      authorization: `Bearer ${ADMIN_KEY}`,
      accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`Gateway admin API ${path} failed: ${res.status}`);
  }

  return res.json() as Promise<T>;
}
