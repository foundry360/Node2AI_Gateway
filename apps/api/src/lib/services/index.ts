/**
 * Unified Auth & Audit Services
 * Centralized exports for all auth and audit services
 */

export { default as UnifiedAuthService } from './unified-auth.service';
export { default as UnifiedAuditService } from './unified-audit.service';
export { default as CustomerAuthService } from './customer-auth.service';

// Re-export types for convenience
export type {
  User,
  UserType,
  UserStatus,
  Session,
  AuthContext,
  Customer,
  CustomerAuthConfig,
  CustomerAuthUser,
  AuditEvent,
  AuditEventType,
  AuditSeverity,
  AIConversation,
  AIMessage,
} from '../types/auth.types';
