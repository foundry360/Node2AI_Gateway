import { randomUUID } from 'node:crypto';
import type { AuditService } from '../audit/service.js';
import type { AdminPrincipal } from './authz.js';

/** Privileged administrative change — never include secrets in before/after. */
export async function recordAdminAudit(
  audit: AuditService,
  input: {
    principal: AdminPrincipal;
    action: string;
    target_type: string;
    target_id: string;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    correlation_id?: string;
    request_id?: string;
  },
): Promise<void> {
  const requestId = input.request_id ?? input.correlation_id ?? randomUUID();
  await audit.record({
    audit_id: randomUUID(),
    timestamp: new Date().toISOString(),
    organization_id: input.principal.organization_id,
    user_id: input.principal.user_id,
    request_id: requestId,
    correlation_id: input.correlation_id ?? requestId,
    operation: input.action,
    policy_decision: 'N/A',
    reason_codes: ['ADMIN_AUDIT', input.action.toUpperCase()],
    metadata: {
      admin_audit: true,
      actor: input.principal.user_id,
      actor_role: input.principal.role,
      action: input.action,
      target_type: input.target_type,
      target_id: input.target_id,
      before: input.before ?? null,
      after: input.after ?? null,
    },
  });
}
