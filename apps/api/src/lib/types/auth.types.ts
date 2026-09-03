/**
 * Unified Auth & Audit System Type Definitions
 * Types for the new unified authentication and audit system
 */

export type UserType = 'admin' | 'end_user';
export type UserStatus = 'active' | 'suspended' | 'deleted';
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface User {
  id: string;
  external_id: string;
  auth_provider: string;
  user_type: UserType;
  email: string;
  full_name?: string;
  display_name?: string;
  metadata: Record<string, any>;
  customer_id: string;
  department?: string;
  role?: string;
  status: UserStatus;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
  deleted_at?: Date;
}

export interface Customer {
  id: string;
  name: string;
  auth_config: CustomerAuthConfig;
  settings: Record<string, any>;
  subscription_tier?: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  organization_id?: string; // Link to existing organizations table
}

export interface CustomerAuthConfig {
  type: 'oauth' | 'saml' | 'jwt' | 'api_key';
  endpoint?: string;
  public_key?: string;
  client_id?: string;
  client_secret?: string;
  issuer?: string;
  audience?: string;
  metadata?: Record<string, any>;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  refresh_token_hash?: string;
  ip_address?: string;
  user_agent?: string;
  expires_at: Date;
  active: boolean;
  created_at: Date;
  last_activity_at: Date;
  // Transient field (not stored in DB)
  token?: string;
}

export type AuditEventType =
  // AI Interactions
  | 'ai_chat_created'
  | 'ai_chat_message_sent'
  | 'ai_chat_message_received'
  | 'ai_model_switched'
  | 'ai_prompt_modified'
  // User Management
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'user_suspended'
  | 'user_reactivated'
  | 'user_login'
  | 'user_logout'
  // Configuration
  | 'api_key_created'
  | 'api_key_revoked'
  | 'settings_updated'
  | 'permissions_changed'
  // Data Operations
  | 'conversation_exported'
  | 'conversation_deleted'
  | 'data_imported'
  | 'data_exported'
  // System Events
  | 'budget_threshold_reached'
  | 'rate_limit_exceeded'
  | 'error_occurred';

export interface AuditEvent {
  id: string;
  user_id?: string;
  customer_id: string;
  actor_email?: string;
  actor_name?: string;
  event_type: AuditEventType;
  event_category: string;
  severity: AuditSeverity;
  resource_type?: string;
  resource_id?: string;
  action: string;
  method?: string;
  endpoint?: string;
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
  success: boolean;
  error_message?: string;
  created_at: Date;
}

export interface AIConversation {
  id: string;
  user_id: string;
  customer_id: string;
  title?: string;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface AIMessage {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  provider?: string;
  tokens_prompt?: number;
  tokens_completion?: number;
  tokens_total?: number;
  cost_usd?: number;
  latency_ms?: number;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface AuthContext {
  user: User;
  session: Session;
  customer: Customer;
}

export interface CustomerAuthUser {
  id: string;
  email: string;
  name?: string;
  provider: string;
  department?: string;
  role?: string;
  metadata?: Record<string, any>;
}
