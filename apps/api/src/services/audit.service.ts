/**
 * Audit Service
 * Comprehensive audit logging for Node2AI
 * Provides complete audit trail with HIPAA 7-year retention support
 */

import { query } from '../lib/db/postgres-client';

export interface AuditLogEntry {
  eventType: string;
  eventCategory: string;
  actorId?: string;
  actorType?: 'user' | 'system' | 'api' | 'service';
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  actorIpAddress?: string;
  actorUserAgent?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  organizationId?: string;
  organizationName?: string;
  department?: string;
  description: string;
  metadata?: Record<string, any>;
  requestData?: Record<string, any>;
  responseData?: Record<string, any>;
  status: 'success' | 'failure' | 'pending' | 'blocked';
  errorMessage?: string;
  errorCode?: string;
  durationMs?: number;
  securityLevel?: 'low' | 'normal' | 'high' | 'critical';
  requiresReview?: boolean;
  blockchainTxId?: string;
}

export interface AuditLogQueryFilters {
  organizationId?: string;
  userId?: string;
  eventCategory?: string;
  eventType?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  securityLevel?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLog {
  id: string;
  eventId: string;
  eventType: string;
  eventCategory: string;
  timestamp: Date;
  actorId?: string;
  actorType?: string;
  actorEmail?: string;
  actorName?: string;
  actorRole?: string;
  actorIpAddress?: string;
  actorUserAgent?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  organizationId?: string;
  organizationName?: string;
  department?: string;
  description?: string;
  metadata?: Record<string, any>;
  status: string;
  errorMessage?: string;
  durationMs?: number;
  securityLevel?: string;
  blockchainTxId?: string;
  blockchainVerified?: boolean;
}

export interface AuditStatistics {
  totalEvents: number;
  aiInteractionEvents: number;
  authenticationEvents: number;
  configurationEvents: number;
  dataAccessEvents: number;
  successfulEvents: number;
  failedEvents: number;
  blockedEvents: number;
  highSecurityEvents: number;
  criticalSecurityEvents: number;
  avgDurationMs: number;
  maxDurationMs: number;
  uniqueUsers: number;
}

export class AuditService {
  /**
   * Generate unique event ID
   * Format: evt_{timestamp}_{random8chars}
   */
  private generateEventId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `evt_${timestamp}_${random}`;
  }

  /**
   * Hash sensitive data (for blockchain or integrity checks)
   */
  private hashData(data: string): string {
    // Simple hash - in production, use crypto.createHash
    return Buffer.from(data).toString('base64').substring(0, 32);
  }

  /**
   * Get event type metadata
   */
  private async getEventTypeMetadata(eventType: string): Promise<{
    securityLevel?: string;
    retentionDays?: number;
  }> {
    try {
      const result = await query(
        `SELECT security_level, retention_days 
         FROM audit_event_types 
         WHERE event_type = $1 AND is_active = true`,
        [eventType]
      );

      if (result.rows.length > 0) {
        return {
          securityLevel: result.rows[0].security_level,
          retentionDays: result.rows[0].retention_days,
        };
      }

      return {
        securityLevel: 'normal',
        retentionDays: 2555, // 7 years default
      };
    } catch (error) {
      console.error('[AuditService] Error getting event type metadata:', error);
      return {
        securityLevel: 'normal',
        retentionDays: 2555,
      };
    }
  }

  /**
   * Core logging method
   */
  async log(entry: AuditLogEntry): Promise<string> {
    try {
      console.log('[AuditService] Starting audit log entry:', {
        eventType: entry.eventType,
        action: entry.action,
        actorId: entry.actorId || 'NULL',
        organizationId: entry.organizationId || 'NULL',
      });

      const eventId = this.generateEventId();
      const eventMetadata = await this.getEventTypeMetadata(entry.eventType);

      const securityLevel =
        entry.securityLevel || eventMetadata.securityLevel || 'normal';
      const retentionDays = eventMetadata.retentionDays || 2555;

      // Determine if blockchain recording is required
      const requiresBlockchain =
        securityLevel === 'critical' || entry.requiresReview === true;

      let blockchainTxId: string | null = entry.blockchainTxId || null;
      let blockchainVerified = false;

      // If blockchainTxId was provided in the entry, mark as verified
      if (blockchainTxId) {
        blockchainVerified = true;
      }

      // TODO: Integrate with blockchain service for critical events if not already provided
      // if (requiresBlockchain && !blockchainTxId) {
      //   try {
      //     blockchainTxId = await blockchainService.record(eventId, entry);
      //     blockchainVerified = true;
      //   } catch (error) {
      //     console.error('[AuditService] Blockchain recording failed:', error);
      //     // Don't fail the audit log if blockchain fails
      //   }
      // }

      console.log('[AuditService] About to insert audit log:', {
        eventId,
        eventType: entry.eventType,
        organizationId: entry.organizationId,
        actorId: entry.actorId || null,
      });

      const insertParams = [
        eventId,
        entry.eventType,
        entry.eventCategory,
        entry.actorId || null,
        entry.actorType || null,
        entry.actorEmail || null,
        entry.actorName || null,
        entry.actorRole || null,
        entry.actorIpAddress || null,
        entry.actorUserAgent || null,
        entry.action,
        entry.resourceType,
        entry.resourceId || null,
        entry.organizationId || null,
        entry.organizationName || null,
        entry.department || null,
        entry.description,
        JSON.stringify(entry.metadata || {}),
        entry.requestData ? JSON.stringify(entry.requestData) : null,
        entry.responseData ? JSON.stringify(entry.responseData) : null,
        entry.status,
        entry.errorMessage || null,
        entry.errorCode || null,
        entry.durationMs || null,
        securityLevel,
        entry.requiresReview || false,
        blockchainTxId,
        blockchainVerified,
        retentionDays,
      ];

      console.log('[AuditService] Insert parameters:', {
        organizationId: insertParams[13],
        actorId: insertParams[3],
        eventType: insertParams[1],
        action: insertParams[10],
      });

      const result = await query(
        `INSERT INTO audit_logs (
          event_id, event_type, event_category, timestamp,
          actor_id, actor_type, actor_email, actor_name, actor_role,
          actor_ip_address, actor_user_agent,
          action, resource_type, resource_id,
          organization_id, organization_name, department,
          description, metadata, request_data, response_data,
          status, error_message, error_code, duration_ms,
          security_level, requires_review,
          blockchain_tx_id, blockchain_verified,
          retention_days
        ) VALUES (
          $1, $2, $3, NOW(),
          $4, $5, $6, $7, $8,
          $9, $10,
          $11, $12, $13,
          $14, $15, $16,
          $17, $18, $19, $20,
          $21, $22, $23, $24,
          $25, $26,
          $27, $28,
          $29
        ) RETURNING id`,
        insertParams
      );

      console.log('[AuditService] ✅ Audit log inserted successfully:', {
        id: result.rows[0]?.id,
        eventId,
      });

      return eventId;
    } catch (error) {
      console.error('[AuditService] Error logging audit event:', error);
      throw error;
    }
  }

  /**
   * Log AI interaction event
   */
  async logAIInteraction(params: {
    userId?: string;
    actorEmail?: string;
    actorName?: string;
    organizationId: string;
    aiProvider: string;
    model: string;
    requestId: string;
    tokensUsed?: number;
    cost?: number;
    durationMs: number;
    phiDetected?: string[];
    status: 'success' | 'failure';
    errorMessage?: string;
    sanitized?: boolean;
    actorIpAddress?: string;
    actorUserAgent?: string;
    blockchainTxId?: string | null;
  }): Promise<string> {
    const eventType =
      params.status === 'failure'
        ? 'ai_response_generated'
        : params.sanitized
          ? 'ai_request_sanitized'
          : 'ai_request_created';

    return this.log({
      eventType,
      eventCategory: 'ai_interaction',
      actorId: params.userId,
      actorType: 'user',
      actorEmail: params.actorEmail,
      actorName: params.actorName,
      action: 'ai_interaction',
      resourceType: 'ai_request',
      resourceId: params.requestId,
      organizationId: params.organizationId,
      description: `AI ${params.aiProvider}/${params.model} ${params.status === 'success' ? 'request' : 'failed'}`,
      metadata: {
        aiProvider: params.aiProvider,
        model: params.model,
        tokensUsed: params.tokensUsed || 0,
        cost: params.cost || 0,
        phiDetected: params.phiDetected || [],
      },
      status: params.status,
      errorMessage: params.errorMessage,
      durationMs: params.durationMs,
      securityLevel:
        params.phiDetected && params.phiDetected.length > 0 ? 'high' : 'normal',
      actorIpAddress: params.actorIpAddress,
      actorUserAgent: params.actorUserAgent,
      blockchainTxId: params.blockchainTxId,
    });
  }

  /**
   * Log authentication event
   */
  async logAuthentication(params: {
    userId?: string;
    email: string;
    organizationId: string;
    action: 'login' | 'logout' | 'login_failed';
    ipAddress?: string;
    userAgent?: string;
    status: 'success' | 'failure';
    errorMessage?: string;
  }): Promise<string> {
    const eventTypeMap = {
      login: 'user_login',
      login_failed: 'user_login_failed',
      logout: 'user_logout',
    };

    return this.log({
      eventType: eventTypeMap[params.action],
      eventCategory: 'authentication',
      actorId: params.userId,
      actorType: 'user',
      actorEmail: params.email,
      actorIpAddress: params.ipAddress,
      actorUserAgent: params.userAgent,
      action: params.action,
      resourceType: 'authentication',
      organizationId: params.organizationId,
      description: `User ${params.action} ${params.status === 'success' ? 'successful' : 'failed'}`,
      status: params.status,
      errorMessage: params.errorMessage,
      securityLevel: params.action === 'login_failed' ? 'high' : 'normal',
    });
  }

  /**
   * Log data access event
   */
  async logDataAccess(params: {
    userId: string;
    organizationId: string;
    action: 'export' | 'delete' | 'access';
    resourceType: string;
    resourceId?: string;
    phiDetected?: boolean;
    status: 'success' | 'failure';
  }): Promise<string> {
    const eventTypeMap = {
      export: 'data_exported',
      delete: 'data_deleted',
      access: 'phi_accessed',
    };

    return this.log({
      eventType: eventTypeMap[params.action],
      eventCategory: 'data_access',
      actorId: params.userId,
      actorType: 'user',
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      organizationId: params.organizationId,
      description: `User ${params.action} ${params.resourceType}`,
      status: params.status,
      securityLevel: params.phiDetected ? 'critical' : 'high',
      requiresReview: params.phiDetected || params.action === 'delete',
    });
  }

  /**
   * Log configuration change event
   */
  async logConfigurationChange(params: {
    userId: string;
    organizationId: string;
    action: 'created' | 'updated' | 'deleted';
    resourceType: 'api_key' | 'settings' | 'policy';
    resourceId?: string;
    changes?: Record<string, any>;
    status: 'success' | 'failure';
  }): Promise<string> {
    const eventTypeMap = {
      created:
        params.resourceType === 'api_key'
          ? 'api_key_created'
          : 'settings_changed',
      updated: 'settings_changed',
      deleted:
        params.resourceType === 'api_key'
          ? 'api_key_deleted'
          : 'settings_changed',
    };

    return this.log({
      eventType: eventTypeMap[params.action],
      eventCategory: 'configuration',
      actorId: params.userId,
      actorType: 'user',
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      organizationId: params.organizationId,
      description: `${params.resourceType} ${params.action}`,
      metadata: params.changes || {},
      status: params.status,
      securityLevel: params.resourceType === 'api_key' ? 'high' : 'normal',
    });
  }

  /**
   * Query audit logs with filters
   */
  async query(filters: AuditLogQueryFilters): Promise<{
    logs: AuditLog[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const limit = Math.min(filters.limit || 50, 100);
      const offset = filters.offset || 0;
      const page = Math.floor(offset / limit) + 1;

      // Build WHERE clause
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.organizationId) {
        conditions.push(`organization_id = $${paramIndex++}`);
        params.push(filters.organizationId);
      }

      if (filters.userId) {
        conditions.push(`actor_id = $${paramIndex++}`);
        params.push(filters.userId);
      }

      if (filters.eventCategory) {
        conditions.push(`event_category = $${paramIndex++}`);
        params.push(filters.eventCategory);
      }

      if (filters.eventType) {
        conditions.push(`event_type = $${paramIndex++}`);
        params.push(filters.eventType);
      }

      if (filters.startDate) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        params.push(filters.startDate.toISOString());
      }

      if (filters.endDate) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        params.push(filters.endDate.toISOString());
      }

      if (filters.status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      }

      if (filters.securityLevel) {
        conditions.push(`security_level = $${paramIndex++}`);
        params.push(filters.securityLevel);
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM audit_logs ${whereClause}`;
      const countResult = await query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.total || '0');

      // Get paginated results
      const dataQuery = `
        SELECT 
          id, event_id, event_type, event_category, timestamp,
          actor_id, actor_type, actor_email, actor_name, actor_role,
          actor_ip_address, actor_user_agent,
          action, resource_type, resource_id,
          organization_id, organization_name, department,
          description, metadata,
          status, error_message, duration_ms,
          security_level, blockchain_tx_id, blockchain_verified
        FROM audit_logs
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      params.push(limit, offset);

      const dataResult = await query(dataQuery, params);

      const logs: AuditLog[] = dataResult.rows.map((row: any) => ({
        id: row.id,
        eventId: row.event_id,
        eventType: row.event_type,
        eventCategory: row.event_category,
        timestamp: new Date(row.timestamp),
        actorId: row.actor_id,
        actorType: row.actor_type,
        actorEmail: row.actor_email,
        actorName: row.actor_name,
        actorRole: row.actor_role,
        actorIpAddress: row.actor_ip_address,
        actorUserAgent: row.actor_user_agent,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        department: row.department,
        description: row.description,
        metadata:
          typeof row.metadata === 'string'
            ? row.metadata
              ? JSON.parse(row.metadata)
              : {}
            : row.metadata || {},
        status: row.status,
        errorMessage: row.error_message,
        durationMs: row.duration_ms,
        securityLevel: row.security_level,
        blockchainTxId: row.blockchain_tx_id || null,
        blockchainVerified: row.blockchain_verified || false,
      }));

      return {
        logs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    } catch (error) {
      console.error('[AuditService] Error querying audit logs:', error);
      throw error;
    }
  }

  /**
   * Get audit statistics
   */
  async getStatistics(params: {
    organizationId: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<AuditStatistics> {
    try {
      const conditions: string[] = [`organization_id = $1`];
      const paramsArray: any[] = [params.organizationId];
      let paramIndex = 2;

      if (params.startDate) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        paramsArray.push(params.startDate.toISOString());
      }

      if (params.endDate) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        paramsArray.push(params.endDate.toISOString());
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const statsQuery = `
        SELECT 
          COUNT(*) as total_events,
          COUNT(*) FILTER (WHERE event_category = 'ai_interaction') as ai_interaction_events,
          COUNT(*) FILTER (WHERE event_category = 'authentication') as authentication_events,
          COUNT(*) FILTER (WHERE event_category = 'configuration') as configuration_events,
          COUNT(*) FILTER (WHERE event_category = 'data_access') as data_access_events,
          COUNT(*) FILTER (WHERE status = 'success') as successful_events,
          COUNT(*) FILTER (WHERE status = 'failure') as failed_events,
          COUNT(*) FILTER (WHERE status = 'blocked') as blocked_events,
          COUNT(*) FILTER (WHERE security_level = 'high') as high_security_events,
          COUNT(*) FILTER (WHERE security_level = 'critical') as critical_security_events,
          AVG(duration_ms) as avg_duration_ms,
          MAX(duration_ms) as max_duration_ms,
          COUNT(DISTINCT actor_id) as unique_users
        FROM audit_logs
        ${whereClause}
      `;

      const statsResult = await query(statsQuery, paramsArray);
      const statsRow = statsResult.rows[0];

      return {
        totalEvents: parseInt(statsRow?.total_events || '0'),
        aiInteractionEvents: parseInt(statsRow?.ai_interaction_events || '0'),
        authenticationEvents: parseInt(statsRow?.authentication_events || '0'),
        configurationEvents: parseInt(statsRow?.configuration_events || '0'),
        dataAccessEvents: parseInt(statsRow?.data_access_events || '0'),
        successfulEvents: parseInt(statsRow?.successful_events || '0'),
        failedEvents: parseInt(statsRow?.failed_events || '0'),
        blockedEvents: parseInt(statsRow?.blocked_events || '0'),
        highSecurityEvents: parseInt(statsRow?.high_security_events || '0'),
        criticalSecurityEvents: parseInt(
          statsRow?.critical_security_events || '0'
        ),
        avgDurationMs: Math.round(parseFloat(statsRow?.avg_duration_ms || '0')),
        maxDurationMs: parseInt(statsRow?.max_duration_ms || '0'),
        uniqueUsers: parseInt(statsRow?.unique_users || '0'),
      };
    } catch (error) {
      console.error('[AuditService] Error getting statistics:', error);
      throw error;
    }
  }

  /**
   * Search audit logs (full-text search)
   */
  async search(params: {
    organizationId: string;
    searchTerm: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    try {
      const limit = Math.min(params.limit || 50, 100);

      const searchQuery = `
        SELECT 
          id, event_id, event_type, event_category, timestamp,
          actor_id, actor_type, actor_email, actor_name, actor_role,
          actor_ip_address, actor_user_agent,
          action, resource_type, resource_id,
          organization_id, organization_name, department,
          description, metadata,
          status, error_message, duration_ms,
          security_level, blockchain_tx_id, blockchain_verified,
          ts_rank(to_tsvector('english', COALESCE(description, '')), plainto_tsquery('english', $2)) as rank
        FROM audit_logs
        WHERE organization_id = $1
          AND (
            to_tsvector('english', COALESCE(description, '')) @@ plainto_tsquery('english', $2)
            OR event_id ILIKE $3
            OR resource_id::text ILIKE $3
          )
        ORDER BY rank DESC, timestamp DESC
        LIMIT $4
      `;

      const searchPattern = `%${params.searchTerm}%`;
      const result = await query(searchQuery, [
        params.organizationId,
        params.searchTerm,
        searchPattern,
        limit,
      ]);

      return result.rows.map((row: any) => ({
        id: row.id,
        eventId: row.event_id,
        eventType: row.event_type,
        eventCategory: row.event_category,
        timestamp: new Date(row.timestamp),
        actorId: row.actor_id,
        actorType: row.actor_type,
        actorEmail: row.actor_email,
        actorName: row.actor_name,
        actorRole: row.actor_role,
        actorIpAddress: row.actor_ip_address,
        actorUserAgent: row.actor_user_agent,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        department: row.department,
        description: row.description,
        metadata: row.metadata,
        status: row.status,
        errorMessage: row.error_message,
        durationMs: row.duration_ms,
        securityLevel: row.security_level,
        blockchainTxId: row.blockchain_tx_id,
        blockchainVerified: row.blockchain_verified,
      }));
    } catch (error) {
      console.error('[AuditService] Error searching audit logs:', error);
      throw error;
    }
  }

  /**
   * Export audit logs to CSV
   */
  async exportToCSV(params: {
    organizationId: string;
    startDate: Date;
    endDate: Date;
  }): Promise<string> {
    try {
      const result = await query(
        `SELECT 
          event_id, timestamp, event_type, event_category,
          COALESCE(actor_email, 'System') as actor,
          action, resource_type, COALESCE(resource_id::text, '') as resource_id,
          status, COALESCE(description, '') as description,
          duration_ms, security_level
        FROM audit_logs
        WHERE organization_id = $1
          AND timestamp >= $2
          AND timestamp <= $3
        ORDER BY timestamp DESC`,
        [
          params.organizationId,
          params.startDate.toISOString(),
          params.endDate.toISOString(),
        ]
      );

      // CSV headers
      const headers = [
        'Event ID',
        'Timestamp',
        'Event Type',
        'Category',
        'Actor',
        'Action',
        'Resource',
        'Resource ID',
        'Status',
        'Description',
        'Duration (ms)',
        'Security Level',
      ];

      // Escape CSV values
      const escapeCSV = (value: any): string => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      // Build CSV
      const csvRows = [
        headers.join(','),
        ...result.rows.map((row: any) =>
          [
            escapeCSV(row.event_id),
            escapeCSV(new Date(row.timestamp).toISOString()),
            escapeCSV(row.event_type),
            escapeCSV(row.event_category),
            escapeCSV(row.actor),
            escapeCSV(row.action),
            escapeCSV(row.resource_type),
            escapeCSV(row.resource_id),
            escapeCSV(row.status),
            escapeCSV(row.description),
            escapeCSV(row.duration_ms),
            escapeCSV(row.security_level),
          ].join(',')
        ),
      ];

      return csvRows.join('\n');
    } catch (error) {
      console.error('[AuditService] Error exporting to CSV:', error);
      throw error;
    }
  }
}
