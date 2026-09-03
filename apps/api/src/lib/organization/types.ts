export type OrganizationTier = 'developer' | 'team' | 'business' | 'enterprise';
export type DeploymentMode = 'cloud' | 'hybrid' | 'airgap';

export interface Organization {
  id: string;
  name: string;
  tier: OrganizationTier;
  deployment_mode: DeploymentMode;
  license_key?: string;
  license_expires_at?: Date;
  usage_limits: {
    requests_per_month: number;
    cost_limit_monthly: number;
    max_api_keys: number;
    max_users: number;
  };
  settings: {
    allow_sso: boolean;
    require_2fa: boolean;
    data_retention_days: number;
    audit_log_retention_days: number;
  };
  created_at: Date;
  updated_at: Date;
  created_by: string;
}

export interface ApiKey {
  id: string;
  key: string; // sk-node2-...
  organization_id: string;
  name: string;
  description?: string;
  scopes: string[]; // ['read', 'write', 'admin']
  rate_limit: number; // requests per minute
  expires_at: Date | null;
  last_used_at: Date | null;
  is_active: boolean;
  created_at: Date;
  created_by: string;
}

export interface User {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  role: 'admin' | 'user' | 'viewer';
  sso_id?: string;
  password_hash?: string;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface UsageStats {
  organization_id: string;
  period: 'daily' | 'weekly' | 'monthly';
  requests_count: number;
  cost_total: number;
  api_calls_by_key: Record<string, number>;
  top_endpoints: Array<{
    endpoint: string;
    calls: number;
    cost: number;
  }>;
  generated_at: Date;
}

export interface RateLimitInfo {
  key_id: string;
  requests_per_minute: number;
  requests_this_minute: number;
  reset_time: Date;
  is_limited: boolean;
}

export interface AuditLogEntry {
  id: string;
  organization_id: string;
  user_id?: string;
  api_key_id?: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, any>;
  ip_address: string;
  user_agent: string;
  timestamp: Date;
}

export interface SSOConfig {
  organization_id: string;
  provider: 'saml' | 'oauth' | 'ldap';
  config: {
    saml?: {
      entity_id: string;
      sso_url: string;
      x509_cert: string;
      name_id_format: string;
    };
    oauth?: {
      client_id: string;
      client_secret: string;
      auth_url: string;
      token_url: string;
      user_info_url: string;
    };
    ldap?: {
      server_url: string;
      bind_dn: string;
      bind_password: string;
      user_search_base: string;
      user_search_filter: string;
    };
  };
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}
