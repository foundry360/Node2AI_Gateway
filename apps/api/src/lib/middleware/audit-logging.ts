/**
 * Audit Logging Middleware
 * Automatically logs all AI requests for compliance and auditing
 */

import { NextRequest, NextResponse } from 'next/server';
import { AuditService } from '../audit/audit.service';
import {
  generateRequestId,
  hashContent,
  AIRequestInput,
  AIRequestStatus,
  AIProvider,
  EntityType,
  EntityCategory,
  DetectionMethod,
  SanitizationAction,
} from '@node2/shared';

const auditService = new AuditService();

interface AuditContext {
  requestId: string;
  startTime: Date;
  organizationId: string;
  userId?: string;
  apiKeyId?: string;
}

// Store audit context in a WeakMap keyed by the request
const auditContextMap = new WeakMap<Request, AuditContext>();

/**
 * Initialize audit logging for a request
 */
export async function initializeAuditLogging(
  request: NextRequest,
  params: {
    endpoint: string;
    organizationId: string;
    userId?: string;
    apiKeyId?: string;
    applicationId?: string;
    provider: AIProvider;
    model: string;
    deploymentMode?: string;
    inputContent?: string;
    sanitizationEnabled?: boolean;
    piiDetected?: number;
    phiDetected?: number;
    sanitizationTypes?: Record<string, number>;
  }
): Promise<string> {
  const requestId = generateRequestId();
  const startTime = new Date();

  // Get request metadata
  const ipAddress =
    request.headers.get('x-forwarded-for') ||
    request.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  // Create input hash if content provided
  const inputHash = params.inputContent
    ? hashContent(params.inputContent)
    : undefined;

  // Build audit log input
  const auditLogInput: AIRequestInput = {
    requestId,
    organizationId: params.organizationId,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
    applicationId: params.applicationId,
    endpoint: params.endpoint,
    httpMethod: request.method,
    ipAddress,
    userAgent,
    provider: params.provider,
    model: params.model,
    deploymentMode: (params.deploymentMode as any) || 'self-hosted',
    inputMessageCount: 1,
    inputTokenCount: 0, // Will be updated when we know actual count
    inputCharacterCount: params.inputContent?.length || 0,
    inputHash,
    sanitizationEnabled: params.sanitizationEnabled !== false,
    piiDetectedCount: params.piiDetected || 0,
    phiDetectedCount: params.phiDetected || 0,
    sanitizationTypes: params.sanitizationTypes || {},
    status: 'pending',
    requestMetadata: {
      timestamp: startTime.toISOString(),
      headers: {
        'content-type': request.headers.get('content-type'),
        accept: request.headers.get('accept'),
      },
    },
    tags: ['auto-logged'],
  };

  // Store context
  auditContextMap.set(request as any, {
    requestId,
    startTime,
    organizationId: params.organizationId,
    userId: params.userId,
    apiKeyId: params.apiKeyId,
  });

  // Log the initial request
  try {
    await auditService.logAIRequest(auditLogInput);
  } catch (error) {
    console.error('Error logging AI request:', error);
    // Don't fail the request if logging fails
  }

  return requestId;
}

/**
 * Update audit log when request completes
 */
export async function completeAuditLogging(
  request: NextRequest,
  updates: {
    outputContent?: string;
    outputTokens?: number;
    inputTokens?: number;
    status: AIRequestStatus;
    httpStatusCode?: number;
    errorType?: string;
    errorMessage?: string;
    finishReason?: string;
    costUsd?: number;
    costInputUsd?: number;
    costOutputUsd?: number;
    queueTimeMs?: number;
    aiProviderTimeMs?: number;
    desanitizationTimeMs?: number;
    complianceFlags?: Record<string, boolean>;
  }
): Promise<void> {
  const context = auditContextMap.get(request as any);

  if (!context) {
    console.warn('No audit context found for request');
    return;
  }

  const endTime = new Date();
  const durationMs = endTime.getTime() - context.startTime.getTime();

  // Create output hash if content provided
  const outputHash = updates.outputContent
    ? hashContent(updates.outputContent)
    : undefined;

  const updateData: any = {
    requestId: context.requestId,
    completedAt: endTime,
    durationMs,
    outputTokenCount: updates.outputTokens,
    inputTokenCount: updates.inputTokens,
    outputHash,
    status: updates.status,
    httpStatusCode: updates.httpStatusCode,
    errorType: updates.errorType,
    errorMessage: updates.errorMessage,
    finishReason: updates.finishReason,
    costUsd: updates.costUsd,
    costInputUsd: updates.costInputUsd,
    costOutputUsd: updates.costOutputUsd,
    queueTimeMs: updates.queueTimeMs,
    aiProviderTimeMs: updates.aiProviderTimeMs,
    desanitizationTimeMs: updates.desanitizationTimeMs,
    complianceFlags: updates.complianceFlags,
  };

  try {
    await auditService.updateAIRequest(context.requestId, updateData);
  } catch (error) {
    console.error('Error updating AI request audit log:', error);
    // Don't fail the request if logging fails
  }

  // Clean up context
  auditContextMap.delete(request as any);
}

/**
 * Log a sanitization event
 */
export async function logSanitizationEvent(
  request: NextRequest,
  event: {
    entityType: EntityType;
    entityCategory: EntityCategory;
    detectionMethod: DetectionMethod;
    confidenceScore: number;
    positionStart: number;
    positionEnd: number;
    contextBefore?: string;
    contextAfter?: string;
    tokenId: string;
    tokenExpiry?: Date;
    action: SanitizationAction;
    originalLength: number;
    metadata?: Record<string, any>;
  }
): Promise<void> {
  const context = auditContextMap.get(request as any);

  if (!context) {
    console.warn('No audit context found for sanitization event');
    return;
  }

  try {
    await auditService.logSanitizationEvent({
      requestId: context.requestId,
      ...event,
    });
  } catch (error) {
    console.error('Error logging sanitization event:', error);
    // Don't fail the request if logging fails
  }
}

/**
 * Get audit context for a request
 */
export function getAuditContext(request: NextRequest): AuditContext | null {
  return auditContextMap.get(request as any) || null;
}

/**
 * Wrapper for route handlers to automatically log audit events
 */
export function withAuditLogging<T>(
  handler: (
    request: NextRequest,
    params: any,
    auditContext: AuditContext
  ) => Promise<NextResponse<T>>
) {
  return async (request: NextRequest, params: any): Promise<NextResponse> => {
    const context = getAuditContext(request);

    if (!context) {
      return NextResponse.json(
        {
          success: false,
          message: 'No audit context found',
          error: 'AUDIT_CONTEXT_MISSING',
        },
        { status: 500 }
      );
    }

    return handler(request, params, context);
  };
}
