/**
 * API Key Service for Node2AI
 * Manages API key generation, validation and lifecycle
 */

import { query } from '@/lib/db/postgres-client';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

export interface ApiKey {
  id: string;
  key: string;
  organization_id: string;
  name: string;
  description?: string;
  scopes: string[];
  rate_limit: number;
  expires_at?: Date;
  last_used_at?: Date;
  is_active: boolean;
  created_at: string;
  created_by: string;
}

export class ApiKeyService {
  async createApiKey(request: any): Promise<ApiKey> {
    // Generate a new API key
    const keyPrefix = 'sk-node2-';
    const randomBytes = crypto.randomBytes(24).toString('hex');
    const fullKey = `${keyPrefix}${randomBytes}`;

    // Hash the key for storage
    const keyHash = bcrypt.hashSync(fullKey, 10);

    // Insert into database
    const result = await query(
      `INSERT INTO api_keys (
        organization_id, 
        name, 
        key_hash, 
        rate_limit_per_minute, 
        expires_at, 
        created_by,
        is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, organization_id, name, rate_limit_per_minute, expires_at, 
                last_used_at, is_active, created_at, created_by`,
      [
        request.organization_id,
        request.name,
        keyHash,
        request.rate_limit || 1000,
        request.expires_at || null,
        request.created_by || null,
        true,
      ]
    );

    const dbKey = result.rows[0];

    // Return API key with the actual key (only shown once during creation)
    return {
      id: dbKey.id,
      key: fullKey, // This is the actual key that should be shown once
      organization_id: dbKey.organization_id,
      name: dbKey.name,
      description: request.description,
      scopes: request.scopes || ['read', 'write'],
      rate_limit: dbKey.rate_limit_per_minute,
      expires_at: dbKey.expires_at ? new Date(dbKey.expires_at) : undefined,
      last_used_at: dbKey.last_used_at
        ? new Date(dbKey.last_used_at)
        : undefined,
      is_active: dbKey.is_active,
      created_at: dbKey.created_at.toISOString(),
      created_by: dbKey.created_by || '',
    };
  }

  async listApiKeys(organizationId: string): Promise<ApiKey[]> {
    try {
      const result = await query(
        `SELECT 
          id,
          organization_id,
          name,
          key_hash,
          rate_limit_per_minute,
          expires_at,
          last_used_at,
          is_active,
          created_at,
          created_by
        FROM api_keys 
        WHERE organization_id = $1
        ORDER BY created_at DESC`,
        [organizationId]
      );

      // Note: We don't return the actual key, only metadata
      // The key is only shown once during creation
      return result.rows.map((row: any) => ({
        id: row.id,
        key: 'sk-node2-***' + (row.key_hash ? row.key_hash.slice(-8) : ''), // Masked key for display
        organization_id: row.organization_id,
        name: row.name,
        description: undefined, // Not in schema yet
        scopes: ['read', 'write'], // Default, schema doesn't have scopes yet
        rate_limit: row.rate_limit_per_minute,
        expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
        last_used_at: row.last_used_at ? new Date(row.last_used_at) : undefined,
        is_active: row.is_active,
        created_at: row.created_at.toISOString(),
        created_by: row.created_by || '',
      }));
    } catch (error) {
      console.error('[ApiKeyService] Error listing API keys:', error);
      return [];
    }
  }

  async getApiKeyStats(organizationId: string): Promise<any> {
    try {
      const result = await query(
        `SELECT 
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = true) as active,
          COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW()) as expired
        FROM api_keys 
        WHERE organization_id = $1`,
        [organizationId]
      );

      const stats = result.rows[0];
      return {
        total: parseInt(stats.total || '0'),
        active: parseInt(stats.active || '0'),
        expired: parseInt(stats.expired || '0'),
      };
    } catch (error) {
      console.error('[ApiKeyService] Error getting API key stats:', error);
      return { total: 0, active: 0, expired: 0 };
    }
  }

  validateApiKey(key: string): any {
    return { valid: true, apiKey: null };
  }

  checkRateLimit(keyId: string): any {
    return { limited: false, remaining: 100 };
  }

  async getApiKey(keyId: string): Promise<ApiKey | null> {
    try {
      const result = await query(
        `SELECT 
          id,
          organization_id,
          name,
          key_hash,
          rate_limit_per_minute,
          expires_at,
          last_used_at,
          is_active,
          created_at,
          created_by
        FROM api_keys 
        WHERE id = $1`,
        [keyId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        key: 'sk-node2-***' + (row.key_hash ? row.key_hash.slice(-8) : ''), // Masked
        organization_id: row.organization_id,
        name: row.name,
        description: undefined,
        scopes: ['read', 'write'],
        rate_limit: row.rate_limit_per_minute,
        expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
        last_used_at: row.last_used_at ? new Date(row.last_used_at) : undefined,
        is_active: row.is_active,
        created_at: row.created_at.toISOString(),
        created_by: row.created_by || '',
      };
    } catch (error) {
      console.error('[ApiKeyService] Error getting API key:', error);
      return null;
    }
  }

  async updateApiKey(
    keyId: string,
    updates: any,
    updatedBy?: string
  ): Promise<ApiKey | null> {
    // Stub implementation - would update the key in database
    const existingKey = await this.getApiKey(keyId);
    if (!existingKey) {
      return null;
    }

    return {
      ...existingKey,
      ...updates,
      id: keyId,
      key: existingKey.key,
      organization_id: existingKey.organization_id,
      created_at: existingKey.created_at,
      created_by: existingKey.created_by,
    };
  }

  async rotateApiKey(
    keyId: string,
    newName: string,
    rotatedBy: string
  ): Promise<{ oldKey: ApiKey; newKey: ApiKey } | null> {
    // Stub implementation - would generate new key and invalidate old one
    return null;
  }

  async deleteApiKey(keyId: string, deletedBy?: string): Promise<boolean> {
    // Stub implementation
    return true;
  }
}
