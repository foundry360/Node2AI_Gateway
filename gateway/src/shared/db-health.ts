export async function checkDatabase(
  databaseUrl?: string,
): Promise<{ ok: boolean; detail: string }> {
  if (!databaseUrl) {
    return { ok: true, detail: 'not_configured' };
  }
  try {
    const mod = await import('pg');
    const Client = mod.default?.Client ?? mod.Client;
    const client = new Client({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 2000,
    });
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return { ok: true, detail: 'connected' };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : 'connection_failed',
    };
  }
}
