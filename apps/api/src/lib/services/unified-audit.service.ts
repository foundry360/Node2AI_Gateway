/**
 * Unified Audit Service
 * Comprehensive audit logging for the new unified auth system
 * Uses PostgreSQL audit_events table
 */

import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/postgres-client';
import { AuditEvent, AuditEventType, AuditSeverity } from '../types/auth.types';

interface CreateAuditEventInput {
  user_id?: string;
  customer_id: string;
  event_type: AuditEventType;
  event_category: string;
  severity?: AuditSeverity;
  action: string;
  resource_type?: string;
  resource_id?: string;
  description?: string;
  changes?: Record<string, any>;
  metadata?: Record<string, any>;
  ai_model?: string;
  ai_provider?: string;
  tokens_used?: number;
  cost_usd?: number;
  ip_address?: string;
  user_agent?: string;
  session_id?: string;
  request_id?: string;
  method?: string;
  endpoint?: string;
  success?: boolean;
  error_message?: string;
}

interface AIInteractionInput {
  user_id: string;
  customer_id: string;
  conversation_id: string;
  message_id: string;
  model: string;
  provider: string;
  tokens_used: number;
  cost_usd: number;
  latency_ms: number;
  role: 'user' | 'assistant';
}

interface UserActionInput {
  user_id: string;
  customer_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  changes?: Record<string, any>;
  description?: string;
  metadata?: Record<string, any>;
}

class UnifiedAuditService {
  /**
   * Log any audit event
   */
  async logEvent(event: CreateAuditEventInput): Promise<AuditEvent | null> {
    try {
      // Get user details for caching actor info
      let actorEmail: string | undefined;
      let actorName: string | undefined;

      if (event.user_id) {
        const user = await this.getUserDetails(event.user_id);
        if (user) {
          actorEmail = user.email;
          actorName = user.full_name;
        }
      }

      // Create audit event
      const auditEventId = uuidv4();
      const severity = event.severity || 'info';

      const metadata = {
        ...(event.metadata || {}),
        ...(event.customer_id ? { customer_id: event.customer_id } : {}),
      };

      // Insert into database
      const result = await query(
        `INSERT INTO audit_events (
          id, user_id, actor_email, actor_name,
          event_type, event_category, severity,
          resource_type, resource_id, action, method, endpoint,
          description, changes, metadata,
          ai_model, ai_provider, tokens_used, cost_usd,
          ip_address, user_agent, session_id, request_id,
          success, error_message, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, NOW()
        ) RETURNING *`,
        [
          auditEventId,
          event.user_id || null,
          actorEmail || null,
          actorName || null,
          event.event_type,
          event.event_category,
          severity,
          event.resource_type || null,
          event.resource_id || null,
          event.action,
          event.method || null,
          event.endpoint || null,
          event.description || null,
          event.changes ? JSON.stringify(event.changes) : null,
          JSON.stringify(metadata),
          event.ai_model || null,
          event.ai_provider || null,
          event.tokens_used || null,
          event.cost_usd || null,
          event.ip_address || null,
          event.user_agent || null,
          event.session_id || null,
          event.request_id || null,
          event.success !== undefined ? event.success : true,
          event.error_message || null,
        ]
      );

      const savedEvent = this.mapRowToAuditEvent(result.rows[0]);

      // Async: Check for alerts (don't await)
      this.checkAuditAlerts(savedEvent).catch(err => {
        console.error('Failed to check audit alerts:', err);
      });

      return savedEvent;
    } catch (error) {
      console.error('Failed to log audit event:', error);
      // Don't throw - audit logging should never break main flow
      return null;
    }
  }

  /**
   * Log AI interaction (chat messages)
   */
  async logAIInteraction(
    params: AIInteractionInput
  ): Promise<AuditEvent | null> {
    const eventType: AuditEventType =
      params.role === 'user'
        ? 'ai_chat_message_sent'
        : 'ai_chat_message_received';

    return this.logEvent({
      user_id: params.user_id,
      customer_id: params.customer_id,
      event_type: eventType,
      event_category: 'ai_interaction',
      action: 'create',
      resource_type: 'message',
      resource_id: params.message_id,
      ai_model: params.model,
      ai_provider: params.provider,
      tokens_used: params.tokens_used,
      cost_usd: params.cost_usd,
      metadata: {
        conversation_id: params.conversation_id,
        latency_ms: params.latency_ms,
        role: params.role,
      },
    });
  }

  /**
   * Log user management actions
   */
  async logUserAction(params: UserActionInput): Promise<AuditEvent | null> {
    const severity: AuditSeverity =
      params.action === 'delete' || params.action === 'suspend'
        ? 'warning'
        : 'info';

    return this.logEvent({
      user_id: params.user_id,
      customer_id: params.customer_id,
      event_type: `${params.resource_type}_${params.action}` as AuditEventType,
      event_category: 'user_management',
      severity,
      action: params.action,
      resource_type: params.resource_type,
      resource_id: params.resource_id,
      changes: params.changes,
      description: params.description,
      metadata: params.metadata,
    });
  }

  /**
   * Get audit trail for a user
   */
  async getUserAuditTrail(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      eventTypes?: AuditEventType[];
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AuditEvent[]> {
    const conditions: string[] = ['user_id = $1'];
    const params: any[] = [userId];
    let paramIndex = 2;

    if (options.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(options.startDate);
      paramIndex++;
    }

    if (options.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(options.endDate);
      paramIndex++;
    }

    if (options.eventTypes && options.eventTypes.length > 0) {
      conditions.push(`event_type = ANY($${paramIndex})`);
      params.push(options.eventTypes);
      paramIndex++;
    }

    const queryText = `
      SELECT * FROM audit_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(options.limit || 100);
    params.push(options.offset || 0);

    const result = await query(queryText, params);
    return result.rows.map(row => this.mapRowToAuditEvent(row));
  }

  /**
   * Get AI usage statistics for a customer
   */
  async getAIUsageStats(
    customerId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      groupBy?: 'user' | 'model' | 'provider' | 'day';
    } = {}
  ) {
    const conditions: string[] = [
      'customer_id = $1',
      "event_category = 'ai_interaction'",
      'tokens_used IS NOT NULL',
    ];
    const params: any[] = [customerId];
    let paramIndex = 2;

    if (options.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(options.startDate);
      paramIndex++;
    }

    if (options.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(options.endDate);
      paramIndex++;
    }

    let groupByClause = '';
    let selectClause = '';

    switch (options.groupBy) {
      case 'user':
        selectClause = 'user_id, actor_email, actor_name,';
        groupByClause = 'GROUP BY user_id, actor_email, actor_name';
        break;
      case 'model':
        selectClause = 'ai_model,';
        groupByClause = 'GROUP BY ai_model';
        break;
      case 'provider':
        selectClause = 'ai_provider,';
        groupByClause = 'GROUP BY ai_provider';
        break;
      case 'day':
        selectClause = 'DATE(created_at) as date,';
        groupByClause = 'GROUP BY DATE(created_at)';
        break;
      default:
        selectClause = '';
        groupByClause = '';
    }

    const queryText = `
      SELECT 
        ${selectClause}
        COUNT(*) as total_messages,
        SUM(tokens_used) as total_tokens,
        SUM(cost_usd) as total_cost,
        AVG(cost_usd) as avg_cost_per_message
      FROM audit_events
      WHERE ${conditions.join(' AND ')}
      ${groupByClause}
      ORDER BY total_cost DESC
    `;

    const result = await query(queryText, params);
    return result.rows;
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(
    customerId: string,
    options: {
      startDate: Date;
      endDate: Date;
      eventTypes?: AuditEventType[];
      format?: 'json' | 'csv';
    }
  ) {
    const conditions: string[] = ['customer_id = $1'];
    const params: any[] = [customerId];
    let paramIndex = 2;

    conditions.push(`created_at >= $${paramIndex}`);
    params.push(options.startDate);
    paramIndex++;

    conditions.push(`created_at <= $${paramIndex}`);
    params.push(options.endDate);
    paramIndex++;

    if (options.eventTypes && options.eventTypes.length > 0) {
      conditions.push(`event_type = ANY($${paramIndex})`);
      params.push(options.eventTypes);
      paramIndex++;
    }

    const queryText = `
      SELECT 
        created_at,
        event_type,
        event_category,
        action,
        actor_email,
        actor_name,
        resource_type,
        resource_id,
        description,
        ai_model,
        ai_provider,
        tokens_used,
        cost_usd,
        success,
        error_message
      FROM audit_events
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;

    const result = await query(queryText, params);

    if (options.format === 'csv') {
      return this.convertToCSV(result.rows);
    }

    return result.rows.map(row => this.mapRowToAuditEvent(row));
  }

  /**
   * Private helper methods
   */

  private async getUserDetails(userId: string) {
    const result = await query(
      'SELECT email, full_name FROM users WHERE id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  private async checkAuditAlerts(event: AuditEvent) {
    // Implement alert logic based on event patterns
    if (event.event_type === 'user_login' && !event.success) {
      await this.checkFailedLoginAttempts(event.user_id, event.customer_id);
    }

    if (event.cost_usd && event.cost_usd > 10) {
      await this.alertHighCostInteraction(event);
    }
  }

  private async checkFailedLoginAttempts(
    userId: string | undefined,
    customerId: string
  ) {
    if (!userId) return;

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const result = await query(
      `SELECT COUNT(*) as failed_count
       FROM audit_events
       WHERE user_id = $1 
         AND customer_id = $2
         AND event_type = 'user_login'
         AND success = false
         AND created_at >= $3`,
      [userId, customerId, fiveMinutesAgo]
    );

    const failedCount = parseInt(result.rows[0]?.failed_count || '0');

    if (failedCount >= 5) {
      console.warn(
        `SECURITY ALERT: ${failedCount} failed login attempts for user ${userId}`
      );
      // TODO: Send notification, lock account, etc.
    }
  }

  private async alertHighCostInteraction(event: AuditEvent) {
    console.warn(
      `HIGH COST ALERT: $${event.cost_usd} interaction by user ${event.user_id}`
    );
    // TODO: Send notification to customer admin
  }

  private convertToCSV(data: any[]): string {
    if (data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(','),
      ...data.map(row =>
        headers
          .map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string' && value.includes(',')) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(',')
      ),
    ];

    return csvRows.join('\n');
  }

  private mapRowToAuditEvent(row: any): AuditEvent {
    let parsedMetadata: Record<string, any> = {};
    if (row.metadata) {
      if (typeof row.metadata === 'string') {
        try {
          parsedMetadata = JSON.parse(row.metadata);
        } catch {
          parsedMetadata = {};
        }
      } else if (typeof row.metadata === 'object') {
        parsedMetadata = row.metadata;
      }
    }

    const customerId =
      row.customer_id ||
      (typeof parsedMetadata.customer_id === 'string'
        ? parsedMetadata.customer_id
        : undefined);

    return {
      id: row.id,
      user_id: row.user_id || undefined,
      customer_id: customerId || '',
      actor_email: row.actor_email || undefined,
      actor_name: row.actor_name || undefined,
      event_type: row.event_type,
      event_category: row.event_category,
      severity: row.severity,
      resource_type: row.resource_type || undefined,
      resource_id: row.resource_id || undefined,
      action: row.action,
      method: row.method || undefined,
      endpoint: row.endpoint || undefined,
      description: row.description || undefined,
      changes:
        typeof row.changes === 'string'
          ? JSON.parse(row.changes)
          : row.changes || undefined,
      metadata: parsedMetadata,
      ai_model: row.ai_model || undefined,
      ai_provider: row.ai_provider || undefined,
      tokens_used: row.tokens_used || undefined,
      cost_usd: row.cost_usd ? parseFloat(row.cost_usd) : undefined,
      ip_address: row.ip_address || undefined,
      user_agent: row.user_agent || undefined,
      session_id: row.session_id || undefined,
      request_id: row.request_id || undefined,
      success: row.success,
      error_message: row.error_message || undefined,
      created_at: new Date(row.created_at),
    };
  }
}

export default UnifiedAuditService;
