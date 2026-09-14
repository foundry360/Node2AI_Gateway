'use client';

import { useEffect, useState } from 'react';
import { roleHasCapability, type AdminRole } from '@/lib/auth-session';

/** Survive soft remounts so gated nav does not flash away on every click. */
let cachedRole: AdminRole | null = null;

/**
 * Client hint for UI gating only - backend remains authoritative.
 */
export function useAdminCapabilities() {
  const [role, setRole] = useState<AdminRole | null>(cachedRole);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/proxy/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { role?: string };
        if (!cancelled && data.role) {
          const next = data.role.toUpperCase() as AdminRole;
          cachedRole = next;
          setRole(next);
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return {
    role,
    canMutateAdmin: role ? roleHasCapability(role, 'admin_mutate') : false,
    canResolveGovernance: role
      ? roleHasCapability(role, 'governance_resolve')
      : false,
    canExport: role ? roleHasCapability(role, 'export') : false,
  };
}
