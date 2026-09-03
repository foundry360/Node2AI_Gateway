import { createHash, randomUUID } from 'node:crypto';

export function newRequestId(): string {
  return `req_${randomUUID().replace(/-/g, '')}`;
}

export function newCorrelationId(): string {
  return `corr_${randomUUID().replace(/-/g, '')}`;
}

export function newAuditId(): string {
  return `aud_${randomUUID().replace(/-/g, '')}`;
}

/** Hash API keys at rest. MVP uses SHA-256; upgrade to argon2/bcrypt in later phases. */
export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey, 'utf8').digest('hex');
}
