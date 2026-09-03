export interface SystemConfig {
  // Core System Settings
  deployment_mode?: 'cloud' | 'hybrid' | 'airgap';
  license_tier?: 'developer' | 'team' | 'business' | 'enterprise';
  license_key?: string;
  license_expires_at?: Date;

  // API Configuration
  api?: {
    port?: number;
    host?: string;
    cors_origins?: string[];
    cors_methods?: string[];
    cors_headers?: string[];
    cors_credentials?: boolean;
    rate_limit_window_ms?: number;
    rate_limit_max_requests?: number;
    request_timeout_ms?: number;
    max_request_size_mb?: number;
  };

  // Database Configuration
  database?: {
    url?: string;
    ssl?: boolean;
    pool_size?: number;
    connection_timeout_ms?: number;
    query_timeout_ms?: number;
    migration_auto_run?: boolean;
  };

  // Redis Configuration
  redis?: {
    url?: string;
    password?: string;
    db?: number;
    connection_timeout_ms?: number;
    command_timeout_ms?: number;
  };

  // Security Configuration
  security?: {
    jwt_secret?: string;
    jwt_expires_in?: string;
    jwt_refresh_expires_in?: string;
    encryption_key?: string;
    encryption_algorithm?: string;
    session_timeout?: number;
    password_min_length?: number;
    password_require_special_chars?: boolean;
    two_factor_required?: boolean;
    sso_enabled?: boolean;
    audit_log_retention_days?: number;
  };

  // AI Model Configuration
  ai_models?: {
    default_provider?: 'openai' | 'anthropic' | 'google' | 'ollama';
    fallback_providers?: string[];
    model_selection_strategy?: 'cost' | 'speed' | 'quality' | 'balanced';
    max_tokens_per_request?: number;
    temperature_default?: number;
    timeout_per_request_ms?: number;
    retry_attempts?: number;
    retry_delay_ms?: number;
  };

  // Data Sanitization Configuration
  sanitization?: {
    enabled?: boolean;
    auto_sanitize?: boolean;
    pii_detection_enabled?: boolean;
    phi_detection_enabled?: boolean;
    custom_patterns_enabled?: boolean;
    tokenization_enabled?: boolean;
    audit_level?: 'BASIC' | 'DETAILED' | 'COMPREHENSIVE';
    retention_days?: number;
  };

  // Compliance Configuration
  compliance?: {
    gdpr_enabled?: boolean;
    hipaa_enabled?: boolean;
    sox_enabled?: boolean;
    pci_enabled?: boolean;
    data_residency_requirements?: string[];
    encryption_at_rest?: boolean;
    encryption_in_transit?: boolean;
    audit_trail_enabled?: boolean;
    data_retention_policy_days?: number;
  };

  // Monitoring Configuration
  monitoring?: {
    metrics_enabled?: boolean;
    health_checks_enabled?: boolean;
    health_check_interval_seconds?: number;
    performance_tracking_enabled?: boolean;
    error_tracking_enabled?: boolean;
    log_level?: 'debug' | 'info' | 'warn' | 'error';
    log_retention_days?: number;
  };

  // Backup Configuration
  backup?: {
    enabled?: boolean;
    schedule?: string; // cron expression
    retention_days?: number;
    compression_enabled?: boolean;
    encryption_enabled?: boolean;
    storage_location?: string;
    max_backup_size_gb?: number;
  };

  // Feature Flags
  features?: {
    sanitization?: boolean;
    rag?: boolean;
    model_comparison?: boolean;
    smart_routing?: boolean;
    local_llm?: boolean;
    analytics?: boolean;
    audit_logs?: boolean;
    compliance_reports?: boolean;
    sso?: boolean;
    multi_tenant?: boolean;
    offline_mode?: boolean;
  };

  // File Upload Configuration
  file_upload?: {
    max_file_size_mb?: number;
    allowed_file_types?: string[];
    virus_scanning_enabled?: boolean;
    quarantine_suspicious_files?: boolean;
    storage_location?: string;
    cleanup_temp_files_after_hours?: number;
  };

  // Notification Configuration
  notifications?: {
    email_enabled?: boolean;
    smtp_host?: string;
    smtp_port?: number;
    smtp_username?: string;
    smtp_password?: string;
    smtp_secure?: boolean;
    webhook_enabled?: boolean;
    webhook_url?: string;
    slack_enabled?: boolean;
    slack_webhook_url?: string;
  };
}

export interface UserPreferences {
  user_id?: string;
  organization_id?: string;

  // UI Preferences
  ui?: {
    theme?: 'light' | 'dark' | 'auto';
    language?: string;
    timezone?: string;
    date_format?: string;
    time_format?: '12h' | '24h';
    dashboard_layout?: 'compact' | 'comfortable' | 'spacious';
    sidebar_collapsed?: boolean;
    notifications_enabled?: boolean;
  };

  // AI Preferences
  ai?: {
    default_model?: string;
    default_temperature?: number;
    default_max_tokens?: number;
    auto_sanitize?: boolean;
    preferred_providers?: string[];
    excluded_models?: string[];
    optimization_strategy?: 'cost' | 'speed' | 'quality' | 'balanced';
    budget_limit?: number;
    quality_threshold?: number;
  };

  // Notification Preferences
  notifications?: {
    email_notifications?: boolean;
    push_notifications?: boolean;
    slack_notifications?: boolean;
    notification_frequency?: 'immediate' | 'hourly' | 'daily' | 'weekly';
    notification_types?: {
      system_alerts?: boolean;
      usage_warnings?: boolean;
      cost_alerts?: boolean;
      security_alerts?: boolean;
      maintenance_notices?: boolean;
    };
  };

  // Privacy Preferences
  privacy?: {
    data_sharing_enabled?: boolean;
    analytics_enabled?: boolean;
    error_reporting_enabled?: boolean;
    usage_tracking_enabled?: boolean;
    personalization_enabled?: boolean;
  };

  // API Preferences
  api?: {
    default_timeout?: number;
    retry_attempts?: number;
    rate_limit_preference?: 'conservative' | 'moderate' | 'aggressive';
    response_format?: 'json' | 'stream';
    include_metadata?: boolean;
    include_costs?: boolean;
    include_performance_metrics?: boolean;
  };
}

export interface OrganizationSettings {
  organization_id?: string;

  // Organization Profile
  profile?: {
    name?: string;
    description?: string;
    industry?: string;
    size?: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
    region?: string;
    timezone?: string;
    currency?: string;
  };

  // Usage Limits
  limits?: {
    requests_per_month?: number;
    cost_limit_monthly?: number;
    max_api_keys?: number;
    max_users?: number;
    max_file_uploads_per_day?: number;
    max_storage_gb?: number;
    max_concurrent_requests?: number;
  };

  // Security Settings
  security?: {
    password_policy?: {
      min_length?: number;
      require_uppercase?: boolean;
      require_lowercase?: boolean;
      require_numbers?: boolean;
      require_special_chars?: boolean;
      max_age_days?: number;
      prevent_reuse_count?: number;
    };
    session_settings?: {
      timeout_minutes?: number;
      max_concurrent_sessions?: number;
      require_reauth_for_sensitive_actions?: boolean;
    };
    ip_whitelist?: string[];
    ip_blacklist?: string[];
    geo_restrictions?: string[];
    two_factor_required?: boolean;
    sso_required?: boolean;
  };

  // Compliance Settings
  compliance?: {
    data_residency?: string[];
    encryption_required?: boolean;
    audit_logging_required?: boolean;
    data_retention_policy_days?: number;
    gdpr_compliance?: boolean;
    hipaa_compliance?: boolean;
    sox_compliance?: boolean;
    pci_compliance?: boolean;
  };

  // Feature Access
  features?: {
    sanitization?: boolean;
    rag?: boolean;
    model_comparison?: boolean;
    smart_routing?: boolean;
    local_llm?: boolean;
    analytics?: boolean;
    audit_logs?: boolean;
    compliance_reports?: boolean;
    sso?: boolean;
    api_access?: boolean;
    web_dashboard?: boolean;
  };

  // Integrations
  integrations?: {
    webhooks_enabled?: boolean;
    slack_enabled?: boolean;
    teams_enabled?: boolean;
    email_enabled?: boolean;
    custom_integrations?: string[];
  };

  // Custom Settings
  custom?: Record<string, any>;
}

export interface ConfigurationUpdate {
  path: string; // dot notation path like 'ai_models.default_provider'
  value: any;
  updated_by: string;
  reason?: string;
}

export interface ConfigurationValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface ConfigurationBackup {
  id: string;
  name: string;
  description?: string;
  created_at: Date;
  created_by: string;
  config_snapshot: SystemConfig;
  size_bytes: number;
}

export interface ConfigurationTemplate {
  id: string;
  name: string;
  description: string;
  category:
    | 'security'
    | 'compliance'
    | 'performance'
    | 'development'
    | 'production';
  config: Partial<SystemConfig>;
  is_default: boolean;
  created_at: Date;
  updated_at: Date;
}
