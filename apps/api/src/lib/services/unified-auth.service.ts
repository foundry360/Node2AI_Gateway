import bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/postgres-client';
import { verifyToken } from '../auth/native-auth';
import {
  AuthContext,
  User as UnifiedUser,
  Session as UnifiedSession,
  Customer as UnifiedCustomer,
} from '../types/auth.types';

type SessionMetadata = {
  ip?: string;
  userAgent?: string;
  platform?: string;
  expiresInMinutes?: number;
};

type AuthResult = {
  user: UnifiedUser;
  session: UnifiedSession;
  customer: UnifiedCustomer;
};

class UnifiedAuthService {
  async adminLogin(
    email: string,
    password: string,
    metadata: SessionMetadata = {}
  ): Promise<AuthResult | null> {
    const userRow = await this.loadUserByEmail(email);
    if (!userRow || userRow.is_active === false) {
      return null;
    }

    if (!userRow.password_hash) {
      console.warn('[UnifiedAuthService] No password hash for user:', email);
      return null;
    }

    const passwordMatches = await bcrypt.compare(
      password,
      userRow.password_hash
    );
    if (!passwordMatches) {
      return null;
    }

    const customerRow = await this.loadCustomerByIdOrOrg(
      userRow.customer_id,
      userRow.organization_id
    );
    if (!customerRow) {
      return null;
    }

    const session = await this.createSession(
      userRow.id,
      customerRow.id,
      metadata.platform || 'admin',
      metadata
    );

    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [
      userRow.id,
    ]);

    return {
      user: this.mapUser(userRow, customerRow.id),
      session,
      customer: this.mapCustomer(customerRow),
    };
  }

  async endUserAuth(
    token: string,
    customerId: string,
    metadata: SessionMetadata & { requestId?: string } = {}
  ): Promise<AuthResult> {
    // First, try validating as an existing session token
    const existingContext = await this.validateSession(token);
    if (existingContext && existingContext.customer.id === customerId) {
      return existingContext;
    }

    // Attempt to treat token as a JWT issued by native auth
    try {
      const decoded = await verifyToken(token);
      const userRow = await this.loadUserById(decoded.userId);
      if (!userRow || userRow.is_active === false) {
        throw new Error('User not found or inactive');
      }

      const customerRow = await this.loadCustomerByIdOrOrg(
        customerId,
        userRow.organization_id
      );
      if (!customerRow) {
        throw new Error('Customer not found');
      }

      const session = await this.createSession(
        userRow.id,
        customerRow.id,
        metadata.platform || 'end-user',
        metadata
      );

      return {
        user: this.mapUser(userRow, customerRow.id),
        session,
        customer: this.mapCustomer(customerRow),
      };
    } catch (error) {
      console.error('[UnifiedAuthService] endUserAuth error:', error);
      throw new Error('Invalid end user token');
    }
  }

  async validateSession(token: string): Promise<AuthContext | null> {
    if (!token) {
      return null;
    }

    try {
      const sessionRow = await this.loadSessionByToken(token);
      if (!sessionRow) {
        return null;
      }

      const expiresAt = new Date(sessionRow.expires_at);
      if (!sessionRow.active || expiresAt.getTime() <= Date.now()) {
        return null;
      }

      const userRow = await this.loadUserById(sessionRow.user_id);
      if (!userRow || userRow.is_active === false) {
        return null;
      }

      const customerRow = await this.loadCustomerByIdOrOrg(
        userRow.customer_id,
        userRow.organization_id
      );
      if (!customerRow) {
        return null;
      }

      await query(
        'UPDATE sessions SET last_activity_at = NOW() WHERE id = $1',
        [sessionRow.id]
      );

      return {
        user: this.mapUser(userRow, customerRow.id),
        session: this.mapSession(sessionRow, token),
        customer: this.mapCustomer(customerRow),
      };
    } catch (error) {
      console.error('[UnifiedAuthService] validateSession error:', error);
      return null;
    }
  }

  async logout(
    sessionId: string,
    userId: string,
    _customerId: string
  ): Promise<void> {
    if (!sessionId) {
      return;
    }

    await query(
      `UPDATE sessions
       SET active = false, last_activity_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );
  }

  async createSession(
    userId: string,
    customerId: string,
    _platform: string,
    metadata: SessionMetadata = {}
  ): Promise<UnifiedSession> {
    const expiresInMinutes = metadata.expiresInMinutes ?? 60 * 24 * 7; // default 7 days
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    for (let attempt = 0; attempt < 5; attempt++) {
      const token = randomBytes(32).toString('hex');
      const tokenHash = this.hashToken(token);
      const sessionId = uuidv4();

      try {
        const result = await query(
          `INSERT INTO sessions (
            id, user_id, token_hash, refresh_token_hash, ip_address, user_agent,
            expires_at, active, created_at, last_activity_at
          ) VALUES ($1, $2, $3, NULL, $4, $5, $6, true, NOW(), NOW())
          RETURNING id, user_id, token_hash, refresh_token_hash,
                    ip_address::text AS ip_address, user_agent, expires_at,
                    active, created_at, last_activity_at`,
          [
            sessionId,
            userId,
            tokenHash,
            metadata.ip ?? null,
            metadata.userAgent ?? null,
            expiresAt.toISOString(),
          ]
        );

        const row = result.rows[0];
        if (!row) {
          continue;
        }

        return this.mapSession(row, token);
      } catch (error: any) {
        if (error?.code === '23505') {
          // Unique violation on token_hash, try again
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to create session');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async loadSessionByToken(token: string): Promise<any | null> {
    const tokenHash = this.hashToken(token);
    const result = await query(
      `SELECT 
        id,
        user_id,
        token_hash,
        refresh_token_hash,
        ip_address::text AS ip_address,
        user_agent,
        expires_at,
        active,
        created_at,
        last_activity_at
      FROM sessions
      WHERE token_hash = $1
      LIMIT 1`,
      [tokenHash]
    );

    return result.rows[0] || null;
  }

  private async loadUserByEmail(email: string): Promise<any | null> {
    const result = await query(
      `SELECT
        id,
        email,
        name,
        role,
        password_hash,
        organization_id,
        customer_id,
        auth_provider,
        user_type,
        status,
        is_active,
        created_at,
        updated_at,
        last_login_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1`,
      [email]
    );

    return result.rows[0] || null;
  }

  private async loadUserById(id: string): Promise<any | null> {
    const result = await query(
      `SELECT
        id,
        email,
        name,
        role,
        password_hash,
        organization_id,
        customer_id,
        auth_provider,
        user_type,
        status,
        is_active,
        created_at,
        updated_at,
        last_login_at
      FROM users
      WHERE id = $1
      LIMIT 1`,
      [id]
    );

    return result.rows[0] || null;
  }

  private async loadCustomerByIdOrOrg(
    customerId?: string,
    organizationId?: string
  ): Promise<any | null> {
    if (customerId) {
      const result = await query(
        `SELECT
          id,
          name,
          auth_config,
          settings,
          subscription_tier,
          status,
          created_at,
          updated_at,
          organization_id
        FROM customers
        WHERE id = $1
        LIMIT 1`,
        [customerId]
      );

      if (result.rows[0]) {
        return result.rows[0];
      }
    }

    if (organizationId) {
      const result = await query(
        `SELECT
          id,
          name,
          auth_config,
          settings,
          subscription_tier,
          status,
          created_at,
          updated_at,
          organization_id
        FROM customers
        WHERE organization_id = $1
        ORDER BY created_at ASC
        LIMIT 1`,
        [organizationId]
      );

      if (result.rows[0]) {
        return result.rows[0];
      }
    }

    if (!organizationId) {
      return null;
    }

    const orgResult = await query(
      `SELECT id, name, created_at, updated_at
       FROM organizations
       WHERE id = $1
       LIMIT 1`,
      [organizationId]
    );

    const orgRow = orgResult.rows[0];
    if (!orgRow) {
      return null;
    }

    return {
      id: customerId || organizationId,
      name: orgRow.name || 'Organization',
      auth_config: { type: 'api_key' },
      settings: {},
      subscription_tier: 'enterprise',
      status: 'active',
      created_at: orgRow.created_at || new Date(),
      updated_at: orgRow.updated_at || new Date(),
      organization_id: organizationId,
    };
  }

  private mapUser(row: any, customerId: string): UnifiedUser {
    return {
      id: row.id,
      external_id: row.external_id || row.id,
      auth_provider: row.auth_provider || 'native',
      user_type: (row.user_type as UnifiedUser['user_type']) || 'admin',
      email: row.email,
      full_name: row.name,
      display_name: row.name,
      metadata: {},
      customer_id: customerId,
      role: row.role || 'admin',
      status:
        row.status === 'suspended' || row.is_active === false
          ? 'suspended'
          : 'active',
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
      last_login_at: row.last_login_at
        ? new Date(row.last_login_at)
        : undefined,
      deleted_at: row.deleted_at ? new Date(row.deleted_at) : undefined,
    };
  }

  private mapSession(row: any, token?: string): UnifiedSession {
    return {
      id: row.id,
      user_id: row.user_id,
      token_hash: row.token_hash,
      refresh_token_hash: row.refresh_token_hash || undefined,
      ip_address: row.ip_address || undefined,
      user_agent: row.user_agent || undefined,
      expires_at: new Date(row.expires_at),
      active: row.active,
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      last_activity_at: row.last_activity_at
        ? new Date(row.last_activity_at)
        : new Date(),
      token,
    };
  }

  private mapCustomer(row: any): UnifiedCustomer {
    const parseJson = (value: any, fallback: any) => {
      if (!value) return fallback;
      if (typeof value === 'object') return value;
      try {
        return JSON.parse(value);
      } catch {
        return fallback;
      }
    };

    return {
      id: row.id,
      name: row.name || 'Customer',
      auth_config: parseJson(row.auth_config, { type: 'api_key' }),
      settings: parseJson(row.settings, {}),
      subscription_tier: row.subscription_tier || 'enterprise',
      status: row.status || 'active',
      created_at: row.created_at ? new Date(row.created_at) : new Date(),
      updated_at: row.updated_at ? new Date(row.updated_at) : new Date(),
      organization_id: row.organization_id || undefined,
    };
  }
}

export default UnifiedAuthService;
