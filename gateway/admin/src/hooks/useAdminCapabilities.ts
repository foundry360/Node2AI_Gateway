'use client';

import { useEffect, useState } from 'react';
import { roleHasCapability, type AdminRole } from '@/lib/auth-session';

/**
 * Client hint for UI gating only - backend remains authoritative.
 */
export function useAdminCapabilities() {
  const [role, setRole] = useState<AdminRole | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/proxy/me', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { role?: string };
        if (!cancelled && data.role) {
          setRole(data.role.toUpperCase() as AdminRole);
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
