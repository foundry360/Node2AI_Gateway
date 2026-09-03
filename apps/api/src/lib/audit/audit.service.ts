/**
 * Audit Logging Service
 * Comprehensive audit and compliance tracking for Node2AI
 * Uses PostgreSQL for database operations
 */

import { query } from '../db/postgres-client';
import {
  AIRequestInput,
  AIRequestUpdate,
  SanitizationEventInput,
  ConversationSessionInput,
  ConversationMessageInput,
  SystemEventInput,
  RateLimitEventInput,
  ComplianceReviewInput,
  AuditLogFilters,
  AuditLogQueryResult,
  AuditStatistics,
} from '@node2/shared';

export class AuditService {
  /**
   * Log an AI request at the start of processing
   * TODO: Migrate to PostgreSQL usage_events table
   */
  async logAIRequest(params: AIRequestInput): Promise<string> {
    throw new Error(
      'Not yet migrated to PostgreSQL - use usage_events directly'
    );
    /* TODO: Migrate
    try {
      const { data, error } = await supabase
        .from('ai_requests')
        .insert({
          request_id: params.requestId,
          created_at: new Date().toISOString(),
          organization_id: params.organizationId,
          user_id: params.userId,
          api_key_id: params.apiKeyId,
          application_id: params.applicationId,
          endpoint: params.endpoint,
          http_method: params.httpMethod,
          ip_address: params.ipAddress,
          user_agent: params.userAgent,
          provider: params.provider,
          model: params.model,
          deployment_mode: params.deploymentMode,
          input_message_count: params.inputMessageCount,
          input_token_count: params.inputTokenCount,
          input_character_count: params.inputCharacterCount,
          input_hash: params.inputHash,
          sanitization_enabled: params.sanitizationEnabled,
          pii_detected_count: params.piiDetectedCount || 0,
          phi_detected_count: params.phiDetectedCount || 0,
          sanitization_types: params.sanitizationTypes || {},
          sanitization_duration_ms: params.sanitizationDurationMs,
          status: params.status,
          request_metadata: params.requestMetadata,
          tags: params.tags || [],
        })
        .select('id')
        .single();

      if (error) throw error;

      return params.requestId;
    } catch (error) {
      console.error('Error logging AI request:', error);
      throw error;
    }
    */
  }

  /**
   * Update an AI request with completion data
   * TODO: Migrate to PostgreSQL usage_events table
   */
  async updateAIRequest(
    requestId: string,
    updates: AIRequestUpdate
  ): Promise<void> {
    try {
      const updateData: any = {};

      if (updates.completedAt)
        updateData.completed_at = updates.completedAt.toISOString();
      if (updates.durationMs !== undefined)
        updateData.duration_ms = updates.durationMs;
      if (updates.outputTokenCount !== undefined)
        updateData.output_token_count = updates.outputTokenCount;
      if (updates.outputCharacterCount !== undefined)
        updateData.output_character_count = updates.outputCharacterCount;
      if (updates.outputHash) updateData.output_hash = updates.outputHash;
      if (updates.finishReason) updateData.finish_reason = updates.finishReason;
      if (updates.status) updateData.status = updates.status;
      if (updates.httpStatusCode !== undefined)
        updateData.http_status_code = updates.httpStatusCode;
      if (updates.errorType) updateData.error_type = updates.errorType;
      if (updates.errorMessage) updateData.error_message = updates.errorMessage;
      if (updates.retryCount !== undefined)
        updateData.retry_count = updates.retryCount;
      if (updates.costUsd !== undefined) updateData.cost_usd = updates.costUsd;
      if (updates.costInputUsd !== undefined)
        updateData.cost_input_usd = updates.costInputUsd;
      if (updates.costOutputUsd !== undefined)
        updateData.cost_output_usd = updates.costOutputUsd;
      if (updates.pricingTier) updateData.pricing_tier = updates.pricingTier;
      if (updates.queueTimeMs !== undefined)
        updateData.queue_time_ms = updates.queueTimeMs;
      if (updates.aiProviderTimeMs !== undefined)
        updateData.ai_provider_time_ms = updates.aiProviderTimeMs;
      if (updates.desanitizationTimeMs !== undefined)
        updateData.desanitization_time_ms = updates.desanitizationTimeMs;
      if (updates.complianceFlags)
        updateData.compliance_flags = updates.complianceFlags;
      if (updates.responseMetadata)
        updateData.response_metadata = updates.responseMetadata;

      // TODO: Migrate to PostgreSQL usage_events table
      throw new Error(
        'Not yet migrated to PostgreSQL - use usage_events directly'
      );
      // const { error } = await supabase
      //   .from('ai_requests')
      //   .update(updateData)
      //   .eq('request_id', requestId);

      // if (error) throw error;
    } catch (error) {
      console.error('Error updating AI request:', error);
      throw error;
    }
  }

  /**
   * Log a sanitization event (PII/PHI detection)
   * TODO: Migrate to PostgreSQL audit_logs table
   */
  async logSanitizationEvent(params: SanitizationEventInput): Promise<string> {
    throw new Error('Not yet migrated to PostgreSQL');
    /* TODO: Migrate
    try {
      // Find the request by requestId string
      const { data: request, error: requestError } = await supabase
        .from('ai_requests')
        .select('id')
        .eq('request_id', params.requestId)
        .single();

      if (requestError || !request) {
        throw new Error(`Request not found: ${params.requestId}`);
      }

      const { data, error } = await supabase
        .from('sanitization_events')
        .insert({
          request_id: request.id,
          created_at: new Date().toISOString(),
          entity_type: params.entityType,
          entity_category: params.entityCategory,
          detection_method: params.detectionMethod,
          confidence_score: params.confidenceScore,
          position_start: params.positionStart,
          position_end: params.positionEnd,
          context_before: params.contextBefore,
          context_after: params.contextAfter,
          token_id: params.tokenId,
          token_expiry: params.tokenExpiry?.toISOString(),
          action: params.action,
          original_length: params.originalLength,
          metadata: params.metadata,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error logging sanitization event:', error);
      throw error;
    }
    */
  }

  /**
   * Create a conversation session
   * TODO: Migrate to PostgreSQL conversation_sessions table
   */
  async createConversationSession(
    params: ConversationSessionInput
  ): Promise<string> {
    throw new Error('Not yet migrated to PostgreSQL');
    /* TODO: Migrate
    try {
      const { data, error } = await supabase
        .from('conversation_sessions')
        .insert({
          session_id: params.sessionId,
          organization_id: params.organizationId,
          user_id: params.userId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          title: params.title,
          context_metadata: params.contextMetadata,
          tags: params.tags || [],
        })
        .select('session_id')
        .single();

      if (error) throw error;
      return params.sessionId;
    } catch (error) {
      console.error('Error creating conversation session:', error);
      throw error;
    }
    */
  }

  /**
   * Add a message to a conversation session
   * TODO: Migrate to PostgreSQL conversation_messages table
   */
  async addConversationMessage(
    params: ConversationMessageInput
  ): Promise<string> {
    throw new Error('Not yet migrated to PostgreSQL');
    /* TODO: Migrate
    try {
      const { data: session, error: sessionError } = await supabase
        .from('conversation_sessions')
        .select('id, message_count, total_input_tokens, total_output_tokens')
        .eq('session_id', params.sessionId)
        .single();

      if (sessionError || !session) {
        throw new Error(`Session not found: ${params.sessionId}`);
      }

      let requestId = null;
      if (params.requestId) {
        const { data: request } = await supabase
          .from('ai_requests')
          .select('id')
          .eq('request_id', params.requestId)
          .single();
        requestId = request?.id;
      }

      const { data, error } = await supabase
        .from('conversation_messages')
        .insert({
          session_id: session.id,
          request_id: requestId,
          message_order: params.messageOrder,
          role: params.role,
          created_at: new Date().toISOString(),
          content_hash: params.contentHash,
          content_length: params.contentLength,
          token_count: params.tokenCount,
          contained_pii: params.containedPii || false,
          pii_types: params.piiTypes,
          metadata: params.metadata,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Update session metrics
      const updateData: any = {
        message_count: session.message_count || 0,
        last_activity_at: new Date().toISOString(),
      };

      if (params.role === 'user') {
        updateData.total_input_tokens =
          (session.total_input_tokens || 0) + params.tokenCount;
      } else if (params.role === 'assistant') {
        updateData.total_output_tokens =
          (session.total_output_tokens || 0) + params.tokenCount;
      }

      await supabase
        .from('conversation_sessions')
        .update({
          ...updateData,
          message_count: (session.message_count || 0) + 1,
        })
        .eq('id', session.id);

      return data.id;
    } catch (error) {
      console.error('Error adding conversation message:', error);
      throw error;
    }
    */
  }

  /**
   * Log a system event
   * TODO: Migrate to PostgreSQL audit_logs table
   */
  async logSystemEvent(params: SystemEventInput): Promise<string> {
    throw new Error('Not yet migrated to PostgreSQL');
    /* TODO: Migrate
    try {
      const { data, error } = await supabase
        .from('system_events')
        .insert({
          created_at: new Date().toISOString(),
          event_type: params.eventType,
          event_category: params.eventCategory,
          severity: params.severity,
          actor_type: params.actorType,
          actor_id: params.actorId,
          actor_ip: params.actorIp,
          actor_user_agent: params.actorUserAgent,
          target_type: params.targetType,
          target_id: params.targetId,
          action: params.action,
          description: params.description,
          changes: params.changes,
          organization_id: params.organizationId,
          request_id: params.requestId,
          status: params.status,
          error_message: params.errorMessage,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error logging system event:', error);
      throw error;
    }
    */
  }

  /**
   * Log a rate limit event
   * TODO: Migrate to PostgreSQL audit_logs table
   */
  async logRateLimitEvent(params: RateLimitEventInput): Promise<string> {
    throw new Error('Not yet migrated to PostgreSQL');
    /* TODO: Migrate
    try {
      const { data, error } = await supabase
        .from('rate_limit_events')
        .insert({
          created_at: new Date().toISOString(),
          organization_id: params.organizationId,
          api_key_id: params.apiKeyId,
          ip_address: params.ipAddress,
          limit_type: params.limitType,
          limit_value: params.limitValue,
          current_value: params.currentValue,
          window_start: params.windowStart?.toISOString(),
          window_end: params.windowEnd?.toISOString(),
          action: params.action,
          retry_after_seconds: params.retryAfterSeconds,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error logging rate limit event:', error);
      throw error;
    }
    */
  }

  /**
   * Create a compliance review
   * TODO: Migrate to PostgreSQL audit_logs table
   */
  async createComplianceReview(params: ComplianceReviewInput): Promise<string> {
    throw new Error('Not yet migrated to PostgreSQL');
    /* TODO: Migrate
    try {
      // Convert request IDs from strings to UUIDs
      const { data: requests } = await supabase
        .from('ai_requests')
        .select('id')
        .in('request_id', params.requestIds);

      const requestIds = requests?.map(r => r.id) || [];

      const { data, error } = await supabase
        .from('compliance_reviews')
        .insert({
          review_type: params.reviewType,
          review_period_start: params.reviewPeriodStart?.toISOString(),
          review_period_end: params.reviewPeriodEnd?.toISOString(),
          reviewed_by: params.reviewedBy,
          reviewed_at: new Date().toISOString(),
          organization_id: params.organizationId,
          request_ids: requestIds,
          sample_size: params.sampleSize,
          findings: params.findings,
          issues_found: params.issuesFound || 0,
          compliance_status: params.complianceStatus,
          actions_required: params.actionsRequired,
          follow_up_required: params.followUpRequired || false,
          follow_up_date: params.followUpDate?.toISOString(),
          metadata: params.metadata,
        })
        .select('id')
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error creating compliance review:', error);
      throw error;
    }
    */
  }

  /**
   * Query audit logs with filters
   * Maps from usage_events table to frontend expected format
   */
  async queryAuditLogs(filters: AuditLogFilters): Promise<AuditLogQueryResult> {
    try {
      const page = filters.page || 1;
      const perPage = Math.min(filters.perPage || 25, 100);
      const offset = (page - 1) * perPage;

      // Build WHERE clause
      const conditions: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.organizationId) {
        conditions.push(`organization_id = $${paramIndex++}`);
        params.push(filters.organizationId);
      }
      if (filters.userId) {
        conditions.push(`user_id = $${paramIndex++}`);
        params.push(filters.userId);
      }
      if (filters.apiKeyId) {
        conditions.push(`api_key_id = $${paramIndex++}`);
        params.push(filters.apiKeyId);
      }
      if (filters.status) {
        conditions.push(`status = $${paramIndex++}`);
        params.push(filters.status);
      }
      if (filters.provider) {
        conditions.push(`provider = $${paramIndex++}`);
        params.push(filters.provider);
      }
      if (filters.model) {
        conditions.push(`model ILIKE $${paramIndex++}`);
        params.push(`%${filters.model}%`);
      }
      if (filters.containsPii) {
        conditions.push(`sanitization_count > 0`);
      }
      if (filters.containsPhi) {
        conditions.push(
          `sanitization_count > 0 AND metadata->>'phi_detected' = 'true'`
        );
      }
      if (filters.startDate) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        params.push(filters.startDate.toISOString());
      }
      if (filters.endDate) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        params.push(filters.endDate.toISOString());
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM usage_events ${whereClause}`;
      const countResult = await query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.total || '0');

      // Get paginated results
      const dataQuery = `
        SELECT 
          id,
          request_id,
          organization_id,
          user_id,
          api_key_id,
          provider,
          model,
          tokens_input,
          tokens_output,
          cost,
          latency_ms,
          status,
          error_message,
          data_sanitized,
          sanitization_count,
          timestamp,
          metadata
        FROM usage_events
        ${whereClause}
        ORDER BY timestamp DESC
        LIMIT $${paramIndex++} OFFSET $${paramIndex++}
      `;
      params.push(perPage, offset);

      const dataResult = await query(dataQuery, params);

      // Map usage_events to frontend format
      const requests = dataResult.rows.map((row: any) => ({
        id: row.id,
        requestId: row.request_id || row.id,
        createdAt: row.timestamp,
        provider: row.provider,
        model: row.model,
        status: row.status || 'success',
        inputTokenCount: row.tokens_input || 0,
        outputTokenCount: row.tokens_output || 0,
        costUsd: parseFloat(row.cost || 0),
        piiDetectedCount: row.data_sanitized ? row.sanitization_count || 0 : 0,
        phiDetectedCount: row.metadata?.phi_detected
          ? row.sanitization_count || 0
          : 0,
        durationMs: row.latency_ms || 0,
        organizationId: row.organization_id,
        userId: row.user_id,
        apiKeyId: row.api_key_id,
        errorMessage: row.error_message,
      }));

      return {
        requests,
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
      };
    } catch (error) {
      console.error('Error querying audit logs:', error);
      throw error;
    }
  }

  /**
   * Get a single audit log by ID
   * TODO: Migrate to PostgreSQL usage_events table
   */
  async getAuditLogById(id: string) {
    throw new Error('Not yet migrated to PostgreSQL');
    /* TODO: Migrate
    try {
      const { data, error } = await supabase
        .from('ai_requests')
        .select(
          `
          *,
          sanitization_events(*),
          conversation_messages(*)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting audit log:', error);
      throw error;
    }
    */
  }

  /**
   * Get audit statistics from usage_events table
   */
  async getAuditStatistics(
    organizationId: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<AuditStatistics> {
    try {
      const conditions: string[] = [`organization_id = $1`];
      const params: any[] = [organizationId];
      let paramIndex = 2;

      if (startDate) {
        conditions.push(`timestamp >= $${paramIndex++}`);
        params.push(startDate.toISOString());
      }
      if (endDate) {
        conditions.push(`timestamp <= $${paramIndex++}`);
        params.push(endDate.toISOString());
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      const statsQuery = `
        SELECT 
          COUNT(*) as total_requests,
          SUM(cost) as total_cost,
          SUM(tokens_input + tokens_output) as total_tokens,
          SUM(CASE WHEN data_sanitized THEN sanitization_count ELSE 0 END) as pii_detections,
          SUM(CASE WHEN metadata->>'phi_detected' = 'true' THEN sanitization_count ELSE 0 END) as phi_detections,
          AVG(latency_ms) as avg_duration_ms,
          COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
          COUNT(CASE WHEN status = 'error' THEN 1 END) as error_count,
          COUNT(DISTINCT provider) as provider_count
        FROM usage_events
        ${whereClause}
      `;

      const statsResult = await query(statsQuery, params);
      const statsRow = statsResult.rows[0];

      // Get status breakdown
      const statusQuery = `
        SELECT status, COUNT(*) as count
        FROM usage_events
        ${whereClause}
        GROUP BY status
      `;
      const statusResult = await query(statusQuery, params);

      // Get provider breakdown
      const providerQuery = `
        SELECT provider, COUNT(*) as count
        FROM usage_events
        ${whereClause}
        GROUP BY provider
      `;
      const providerResult = await query(providerQuery, params);

      const requestsByStatus: Record<string, number> = {};
      statusResult.rows.forEach((row: any) => {
        requestsByStatus[row.status || 'success'] = parseInt(row.count || '0');
      });

      const requestsByProvider: Record<string, number> = {};
      providerResult.rows.forEach((row: any) => {
        requestsByProvider[row.provider] = parseInt(row.count || '0');
      });

      const stats: AuditStatistics = {
        totalRequests: parseInt(statsRow?.total_requests || '0'),
        requestsByStatus,
        requestsByProvider,
        totalCost: parseFloat(statsRow?.total_cost || '0'),
        totalTokens: parseInt(statsRow?.total_tokens || '0'),
        piiDetectionsCount: parseInt(statsRow?.pii_detections || '0'),
        phiDetectionsCount: parseInt(statsRow?.phi_detections || '0'),
        avgDurationMs: Math.round(parseFloat(statsRow?.avg_duration_ms || '0')),
      };

      return stats;
    } catch (error) {
      console.error('Error getting audit statistics:', error);
      throw error;
    }
  }

  /**
   * Get conversation history by session ID
   * TODO: Migrate to PostgreSQL conversation_sessions table
   */
  async getConversationHistory(sessionId: string) {
    throw new Error('Not yet migrated to PostgreSQL');
    /* TODO: Migrate
    try {
      const { data, error } = await supabase
        .from('conversation_sessions')
        .select(
          `
          *,
          conversation_messages(*)
        `
        )
        .eq('session_id', sessionId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error getting conversation history:', error);
      throw error;
    }
    */
  }

  /**
   * Export audit logs as CSV or JSON
   * Uses queryAuditLogs which is already migrated
   */
  async exportAuditLogs(
    filters: AuditLogFilters,
    format: 'csv' | 'json'
  ): Promise<string> {
    try {
      const result = await this.queryAuditLogs({
        ...filters,
        page: 1,
        perPage: 10000, // Max for export
      });

      if (format === 'json') {
        return JSON.stringify(result.requests, null, 2);
      }

      // CSV format
      if (!result.requests || result.requests.length === 0) {
        return 'No data to export';
      }

      // Get headers from first record
      const headers = Object.keys(result.requests[0]);
      const csv = [
        headers.join(','),
        ...result.requests.map((row: any) =>
          headers
            .map(header => {
              const value = row[header];
              if (value === null || value === undefined) return '';
              if (typeof value === 'object') return JSON.stringify(value);
              return String(value).replace(/,/g, ';');
            })
            .join(',')
        ),
      ].join('\n');

      return csv;
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired token mappings
   * TODO: Migrate to PostgreSQL token_mappings table
   */
  async cleanupExpiredTokens(): Promise<number> {
    throw new Error('Not yet migrated to PostgreSQL');
    /* TODO: Migrate
    try {
      const { data, error } = await supabase
        .from('sanitization_events')
        .delete()
        .lt('token_expiry', new Date().toISOString())
        .select();

      if (error) throw error;
      return data?.length || 0;
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
      throw error;
    }
    */
  }
}
