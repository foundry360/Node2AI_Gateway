/**
 * Air-gap network fence: deny all outbound HTTP from the gateway process.
 * Local appliance services should not rely on public internet.
 */
export class AirgapNetworkDeniedError extends Error {
  constructor(url: string) {
    super(`AIRGAP_NETWORK_DENIED: outbound request blocked (${url})`);
    this.name = 'AirgapNetworkDeniedError';
  }
}

export function createAirgapFetch(options?: {
  /** Allow these hostnames (e.g. postgres hostname in compose). Default: none. */
  allowHosts?: string[];
}): typeof fetch {
  const allow = new Set(options?.allowHosts ?? []);

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    let host = '';
    try {
      host = new URL(url).hostname;
    } catch {
      throw new AirgapNetworkDeniedError(url);
    }

    const loopback =
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host === 'postgres' ||
      host === 'gateway';

    if (allow.has(host) || loopback) {
      // Even loopback is denied by default in strict unit proofs unless explicitly allowed.
      // Appliance air-gap still permits local postgres/gateway health via allowHosts.
      if (!allow.has(host) && !options?.allowHosts?.includes(host) && !allow.has('*loopback*')) {
        // Strict fence used in Test 10: deny everything including loopback external AI.
        throw new AirgapNetworkDeniedError(url);
      }
    }

    if (allow.has(host) || (allow.has('*loopback*') && loopback)) {
      return fetch(input, init);
    }

    throw new AirgapNetworkDeniedError(url);
  };
}

/** Strict fence used in automated proofs — every outbound fetch fails. */
export function createStrictAirgapFetch(): typeof fetch {
  return async (input: RequestInfo | URL) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    throw new AirgapNetworkDeniedError(url);
  };
}

export function isLocalProviderKind(kind: string): boolean {
  return kind === 'local';
}
