/**
 * Customer Authentication Service
 * Validates tokens from customer auth systems (JWT, OAuth, SAML, API Key)
 * Uses PostgreSQL customers table for auth configuration
 */

import * as jwt from 'jsonwebtoken';
import { createHash } from 'crypto';
import { query } from '../db/postgres-client';
import { CustomerAuthConfig, CustomerAuthUser } from '../types/auth.types';

class CustomerAuthService {
  /**
   * Validate token based on customer's auth configuration
   */
  async validateToken(
    token: string,
    customerId: string
  ): Promise<CustomerAuthUser | null> {
    try {
      // Get customer auth configuration
      const customer = await this.getCustomerAuthConfig(customerId);

      if (!customer) {
        console.error(`Customer not found: ${customerId}`);
        return null;
      }

      const authConfig: CustomerAuthConfig = customer.auth_config;

      if (!authConfig || !authConfig.type) {
        console.error(
          `No auth configuration found for customer: ${customerId}`
        );
        return null;
      }

      switch (authConfig.type) {
        case 'jwt':
          return this.validateJWT(token, authConfig);

        case 'oauth':
          return this.validateOAuth(token, authConfig);

        case 'saml':
          return this.validateSAML(token, authConfig);

        case 'api_key':
          return this.validateApiKey(token, customerId);

        default:
          console.error(
            `Unsupported auth type: ${authConfig.type} for customer ${customerId}`
          );
          return null;
      }
    } catch (error) {
      console.error('Token validation error:', error);
      return null;
    }
  }

  /**
   * Validate JWT token
   */
  private async validateJWT(
    token: string,
    config: CustomerAuthConfig
  ): Promise<CustomerAuthUser | null> {
    try {
      if (!config.public_key) {
        throw new Error('No public key configured for JWT validation');
      }

      const decoded = jwt.verify(token, config.public_key, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ['RS256', 'HS256'],
      }) as any;

      return {
        id: decoded.sub || decoded.user_id || decoded.id || decoded.email,
        email: decoded.email || decoded.sub || decoded.user_id || decoded.id,
        name: decoded.name || decoded.full_name || decoded.username,
        provider: 'jwt',
        department: decoded.department,
        role: decoded.role,
        metadata: {
          ...decoded,
          token_issued_at: decoded.iat,
          token_expires_at: decoded.exp,
        },
      };
    } catch (error) {
      console.error('JWT validation failed:', error);
      return null;
    }
  }

  /**
   * Validate OAuth token
   */
  private async validateOAuth(
    token: string,
    config: CustomerAuthConfig
  ): Promise<CustomerAuthUser | null> {
    try {
      if (!config.endpoint) {
        throw new Error('No endpoint configured for OAuth validation');
      }

      // Call customer's OAuth introspection endpoint
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${config.client_secret || ''}`,
        },
        body: new URLSearchParams({
          token,
          client_id: config.client_id || '',
        }),
      });

      if (!response.ok) {
        throw new Error(
          `OAuth introspection failed: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.active) {
        return null;
      }

      return {
        id: data.sub || data.user_id || data.id,
        email: data.email,
        name: data.name,
        provider: 'oauth',
        department: data.department,
        role: data.role,
        metadata: data,
      };
    } catch (error) {
      console.error('OAuth validation failed:', error);
      return null;
    }
  }

  /**
   * Validate SAML token
   */
  private async validateSAML(
    token: string,
    config: CustomerAuthConfig
  ): Promise<CustomerAuthUser | null> {
    try {
      // SAML validation typically requires the full assertion
      // This is a simplified placeholder - implement based on your SAML library

      if (!config.public_key) {
        throw new Error('No certificate configured for SAML validation');
      }

      // TODO: Implement SAML validation using a library like saml2-js or passport-saml
      // For now, return null as SAML requires more complex setup
      console.warn('SAML validation not fully implemented');
      return null;
    } catch (error) {
      console.error('SAML validation failed:', error);
      return null;
    }
  }

  /**
   * Validate API key (simple key-based auth)
   */
  private async validateApiKey(
    apiKey: string,
    customerId: string
  ): Promise<CustomerAuthUser | null> {
    try {
      // Hash the provided API key
      const keyHash = this.hashApiKey(apiKey);

      // Look up API key in database
      const result = await query(
        `SELECT u.*, k.name as key_name
         FROM users u
         JOIN customer_api_keys k ON u.id = k.user_id
         WHERE k.key_hash = $1 
           AND k.customer_id = $2
           AND k.active = true
           AND (k.expires_at IS NULL OR k.expires_at > NOW())`,
        [keyHash, customerId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];

      // Update last used timestamp
      await query(
        `UPDATE customer_api_keys 
         SET last_used_at = NOW() 
         WHERE key_hash = $1 AND customer_id = $2`,
        [keyHash, customerId]
      );

      return {
        id: user.external_id || user.id,
        email: user.email,
        name: user.full_name || user.name,
        provider: 'api_key',
        department: user.department,
        role: user.role,
        metadata: {
          ...(typeof user.metadata === 'string'
            ? JSON.parse(user.metadata)
            : user.metadata || {}),
          key_name: user.key_name,
        },
      };
    } catch (error) {
      console.error('API key validation failed:', error);
      return null;
    }
  }

  /**
   * Configure customer auth system
   */
  async configureCustomerAuth(
    customerId: string,
    authConfig: CustomerAuthConfig
  ): Promise<void> {
    try {
      await query(
        `UPDATE customers 
         SET auth_config = $1, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(authConfig), customerId]
      );
    } catch (error) {
      console.error('Failed to configure customer auth:', error);
      throw error;
    }
  }

  /**
   * Test customer auth configuration
   */
  async testAuthConfiguration(
    customerId: string,
    testToken: string
  ): Promise<{ success: boolean; user?: CustomerAuthUser; error?: string }> {
    try {
      const user = await this.validateToken(testToken, customerId);

      if (!user) {
        return {
          success: false,
          error: 'Token validation failed',
        };
      }

      return {
        success: true,
        user,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Helper methods
   */

  private async getCustomerAuthConfig(customerId: string) {
    const result = await query(
      'SELECT id, name, auth_config FROM customers WHERE id = $1',
      [customerId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      auth_config:
        typeof row.auth_config === 'string'
          ? JSON.parse(row.auth_config)
          : row.auth_config || { type: 'jwt' },
    };
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }
}

export default CustomerAuthService;
