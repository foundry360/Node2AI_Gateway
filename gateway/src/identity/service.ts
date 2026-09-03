import { GatewayError } from '../shared/errors.js';
import { hashApiKey } from '../shared/ids.js';
import type { IdentityStore } from './store.js';
import type { AuthenticatedPrincipal, User } from './types.js';

export class IdentityService {
  constructor(private readonly store: IdentityStore) {}

  async authenticateApiKey(rawKey: string | undefined): Promise<AuthenticatedPrincipal> {
    if (!rawKey || rawKey.trim() === '') {
      throw new GatewayError('UNAUTHENTICATED', 'Missing API key.', 401);
    }

    const record = await this.store.findApiKeyByHash(hashApiKey(rawKey.trim()));
    if (!record) {
      throw new GatewayError('UNAUTHENTICATED', 'Invalid API key.', 401);
    }

    const organization = await this.store.getOrganization(record.organization_id);
    const application = await this.store.getApplication(record.application_id);

    if (!organization || organization.status !== 'active') {
      throw new GatewayError('UNAUTHENTICATED', 'Organization inactive or missing.', 401);
    }
    if (!application || application.status !== 'active') {
      throw new GatewayError('APPLICATION_INACTIVE', 'Application inactive or missing.', 403);
    }
    if (application.organization_id !== organization.organization_id) {
      throw new GatewayError('INTERNAL_ERROR', 'Identity integrity failure.', 500);
    }

    return { organization, application, apiKeyId: record.api_key_id };
  }

  /**
   * Resolve user from authoritative store. Client-supplied id is a lookup key only —
   * roles/permissions come from the store, never from the request body.
   */
  async resolveUser(organizationId: string, userId: string): Promise<User> {
    const user = await this.store.getUser(userId);
    if (!user || user.organization_id !== organizationId) {
      throw new GatewayError('USER_NOT_FOUND', 'User not found for organization.', 403);
    }
    if (user.status !== 'active') {
      throw new GatewayError('USER_INACTIVE', 'User is not active.', 403);
    }
    return user;
  }
}
