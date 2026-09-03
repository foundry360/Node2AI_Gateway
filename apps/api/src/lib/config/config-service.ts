import {
  SystemConfig,
  UserPreferences,
  OrganizationSettings,
  ConfigurationUpdate,
  ConfigurationValidation,
  ConfigurationBackup,
  ConfigurationTemplate,
} from './types';
import * as crypto from 'crypto';

export class ConfigurationService {
  private systemConfig: SystemConfig;
  private userPreferences: Map<string, UserPreferences> = new Map();
  private organizationSettings: Map<string, OrganizationSettings> = new Map();
  private configBackups: Map<string, ConfigurationBackup> = new Map();
  private configTemplates: Map<string, ConfigurationTemplate> = new Map();

  constructor() {
    this.systemConfig = this.getDefaultSystemConfig();
    this.initializeConfigTemplates();
  }

  /**
   * Get system configuration
   */
  getSystemConfig(): SystemConfig {
    return { ...this.systemConfig };
  }

  /**
   * Update system configuration
   */
  async updateSystemConfig(
    updates: Partial<SystemConfig>,
    updatedBy: string,
    reason?: string
  ): Promise<ConfigurationValidation> {
    const validation = this.validateSystemConfig(updates);

    if (!validation.valid) {
      return validation;
    }

    // Create backup before updating
    await this.createConfigBackup('System config update', updatedBy);

    // Apply updates
    this.systemConfig = this.mergeConfig(this.systemConfig, updates);

    console.log(
      `System configuration updated by ${updatedBy}: ${reason || 'No reason provided'}`
    );
    return validation;
  }

  /**
   * Get user preferences
   */
  getUserPreferences(userId: string): UserPreferences | null {
    return this.userPreferences.get(userId) || null;
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(
    userId: string,
    organizationId: string,
    updates: Partial<UserPreferences>,
    updatedBy: string
  ): Promise<ConfigurationValidation> {
    const validation = this.validateUserPreferences(updates);

    if (!validation.valid) {
      return validation;
    }

    const existing = this.userPreferences.get(userId);
    const preferences: UserPreferences = {
      user_id: userId,
      organization_id: organizationId,
      ui: {
        theme: 'light',
        language: 'en',
        timezone: 'UTC',
        date_format: 'YYYY-MM-DD',
        time_format: '24h',
        dashboard_layout: 'comfortable',
        sidebar_collapsed: false,
        notifications_enabled: true,
        ...existing?.ui,
        ...updates.ui,
      },
      ai: {
        default_model: 'gpt-3.5-turbo',
        default_temperature: 0.7,
        default_max_tokens: 1000,
        auto_sanitize: true,
        preferred_providers: ['openai'],
        excluded_models: [],
        optimization_strategy: 'balanced',
        budget_limit: 0.1,
        quality_threshold: 0.7,
        ...existing?.ai,
        ...updates.ai,
      },
      notifications: {
        email_notifications: true,
        push_notifications: false,
        slack_notifications: false,
        notification_frequency: 'immediate',
        notification_types: {
          system_alerts: true,
          usage_warnings: true,
          cost_alerts: true,
          security_alerts: true,
          maintenance_notices: true,
        },
        ...existing?.notifications,
        ...updates.notifications,
      },
      privacy: {
        data_sharing_enabled: false,
        analytics_enabled: true,
        error_reporting_enabled: true,
        usage_tracking_enabled: true,
        personalization_enabled: true,
        ...existing?.privacy,
        ...updates.privacy,
      },
      api: {
        default_timeout: 30000,
        retry_attempts: 3,
        rate_limit_preference: 'moderate',
        response_format: 'json',
        include_metadata: true,
        include_costs: true,
        include_performance_metrics: true,
        ...existing?.api,
        ...updates.api,
      },
    };

    this.userPreferences.set(userId, preferences);
    console.log(`User preferences updated for user ${userId} by ${updatedBy}`);
    return validation;
  }

  /**
   * Get organization settings
   */
  getOrganizationSettings(organizationId: string): OrganizationSettings | null {
    return this.organizationSettings.get(organizationId) || null;
  }

  /**
   * Update organization settings
   */
  async updateOrganizationSettings(
    organizationId: string,
    updates: Partial<OrganizationSettings>,
    updatedBy: string
  ): Promise<ConfigurationValidation> {
    const validation = this.validateOrganizationSettings(updates);

    if (!validation.valid) {
      return validation;
    }

    const existing = this.organizationSettings.get(organizationId);
    const settings: OrganizationSettings = {
      organization_id: organizationId,
      profile: {
        name: 'Default Organization',
        industry: 'technology',
        size: 'medium',
        region: 'us-east-1',
        timezone: 'UTC',
        currency: 'USD',
        ...existing?.profile,
        ...updates.profile,
      },
      limits: {
        requests_per_month: 10000,
        cost_limit_monthly: 100,
        max_api_keys: 10,
        max_users: 25,
        max_file_uploads_per_day: 100,
        max_storage_gb: 10,
        max_concurrent_requests: 50,
        ...existing?.limits,
        ...updates.limits,
      },
      security: {
        password_policy: {
          min_length: 8,
          require_uppercase: true,
          require_lowercase: true,
          require_numbers: true,
          require_special_chars: true,
          max_age_days: 90,
          prevent_reuse_count: 5,
        },
        session_settings: {
          timeout_minutes: 60,
          max_concurrent_sessions: 5,
          require_reauth_for_sensitive_actions: true,
        },
        ip_whitelist: [],
        ip_blacklist: [],
        geo_restrictions: [],
        two_factor_required: false,
        sso_required: false,
        ...existing?.security,
        ...updates.security,
      },
      compliance: {
        data_residency: ['us-east-1'],
        encryption_required: true,
        audit_logging_required: true,
        data_retention_policy_days: 365,
        gdpr_compliance: false,
        hipaa_compliance: false,
        sox_compliance: false,
        pci_compliance: false,
        ...existing?.compliance,
        ...updates.compliance,
      },
      features: {
        sanitization: true,
        rag: true,
        model_comparison: true,
        smart_routing: true,
        local_llm: false,
        analytics: true,
        audit_logs: true,
        compliance_reports: false,
        sso: false,
        api_access: true,
        web_dashboard: true,
        ...existing?.features,
        ...updates.features,
      },
      integrations: {
        webhooks_enabled: false,
        slack_enabled: false,
        teams_enabled: false,
        email_enabled: true,
        custom_integrations: [],
        ...existing?.integrations,
        ...updates.integrations,
      },
      custom: {
        ...existing?.custom,
        ...updates.custom,
      },
    };

    this.organizationSettings.set(organizationId, settings);
    console.log(
      `Organization settings updated for ${organizationId} by ${updatedBy}`
    );
    return validation;
  }

  /**
   * Create configuration backup
   */
  async createConfigBackup(
    name: string,
    createdBy: string,
    description?: string
  ): Promise<ConfigurationBackup> {
    const backup: ConfigurationBackup = {
      id: `backup_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`,
      name,
      description,
      created_at: new Date(),
      created_by: createdBy,
      config_snapshot: { ...this.systemConfig },
      size_bytes: JSON.stringify(this.systemConfig).length,
    };

    this.configBackups.set(backup.id, backup);
    console.log(`Configuration backup created: ${backup.id}`);
    return backup;
  }

  /**
   * Restore configuration from backup
   */
  async restoreFromBackup(
    backupId: string,
    restoredBy: string
  ): Promise<ConfigurationValidation> {
    const backup = this.configBackups.get(backupId);
    if (!backup) {
      return {
        valid: false,
        errors: ['Backup not found'],
        warnings: [],
        suggestions: [],
      };
    }

    const validation = this.validateSystemConfig(backup.config_snapshot);
    if (!validation.valid) {
      return validation;
    }

    // Create backup of current config before restoring
    await this.createConfigBackup('Pre-restore backup', restoredBy);

    this.systemConfig = { ...backup.config_snapshot };
    console.log(
      `Configuration restored from backup ${backupId} by ${restoredBy}`
    );
    return validation;
  }

  /**
   * Get configuration templates
   */
  getConfigTemplates(): ConfigurationTemplate[] {
    return Array.from(this.configTemplates.values());
  }

  /**
   * Apply configuration template
   */
  async applyTemplate(
    templateId: string,
    appliedBy: string
  ): Promise<ConfigurationValidation> {
    const template = this.configTemplates.get(templateId);
    if (!template) {
      return {
        valid: false,
        errors: ['Template not found'],
        warnings: [],
        suggestions: [],
      };
    }

    const validation = this.validateSystemConfig(template.config);
    if (!validation.valid) {
      return validation;
    }

    // Create backup before applying template
    await this.createConfigBackup(
      `Template application: ${template.name}`,
      appliedBy
    );

    this.systemConfig = this.mergeConfig(this.systemConfig, template.config);
    console.log(
      `Configuration template ${template.name} applied by ${appliedBy}`
    );
    return validation;
  }

  /**
   * Validate system configuration
   */
  private validateSystemConfig(
    config: Partial<SystemConfig>
  ): ConfigurationValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Validate API configuration
    if (config.api?.port && (config.api.port < 1 || config.api.port > 65535)) {
      errors.push('API port must be between 1 and 65535');
    }

    if (
      config.api?.rate_limit_max_requests &&
      config.api.rate_limit_max_requests < 1
    ) {
      errors.push('Rate limit max requests must be at least 1');
    }

    // Validate database configuration
    if (
      config.database?.pool_size &&
      (config.database.pool_size < 1 || config.database.pool_size > 100)
    ) {
      warnings.push('Database pool size should be between 1 and 100');
    }

    // Validate security configuration
    if (
      config.security?.password_min_length &&
      config.security.password_min_length < 8
    ) {
      warnings.push('Password minimum length should be at least 8 characters');
    }

    if (
      config.security?.session_timeout &&
      config.security.session_timeout < 300
    ) {
      warnings.push(
        'Session timeout should be at least 5 minutes (300 seconds)'
      );
    }

    // Validate AI model configuration
    if (
      config.ai_models?.max_tokens_per_request &&
      config.ai_models.max_tokens_per_request > 100000
    ) {
      warnings.push(
        'Max tokens per request is very high, consider reducing for cost optimization'
      );
    }

    if (
      config.ai_models?.temperature_default &&
      (config.ai_models.temperature_default < 0 ||
        config.ai_models.temperature_default > 2)
    ) {
      errors.push('Temperature must be between 0 and 2');
    }

    // Validate compliance configuration
    if (
      config.compliance?.data_retention_policy_days &&
      config.compliance.data_retention_policy_days < 30
    ) {
      warnings.push(
        'Data retention policy should be at least 30 days for compliance'
      );
    }

    // Validate file upload configuration
    if (
      config.file_upload?.max_file_size_mb &&
      config.file_upload.max_file_size_mb > 100
    ) {
      warnings.push(
        'Max file size is very large, consider reducing for security'
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Validate user preferences
   */
  private validateUserPreferences(
    preferences: Partial<UserPreferences>
  ): ConfigurationValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (
      preferences.ai?.default_temperature &&
      (preferences.ai.default_temperature < 0 ||
        preferences.ai.default_temperature > 2)
    ) {
      errors.push('Default temperature must be between 0 and 2');
    }

    if (
      preferences.ai?.budget_limit &&
      (preferences.ai.budget_limit < 0 || preferences.ai.budget_limit > 1)
    ) {
      errors.push('Budget limit must be between 0 and 1');
    }

    if (
      preferences.ai?.quality_threshold &&
      (preferences.ai.quality_threshold < 0 ||
        preferences.ai.quality_threshold > 1)
    ) {
      errors.push('Quality threshold must be between 0 and 1');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Validate organization settings
   */
  private validateOrganizationSettings(
    settings: Partial<OrganizationSettings>
  ): ConfigurationValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (
      settings.limits?.requests_per_month &&
      settings.limits.requests_per_month < 1
    ) {
      errors.push('Requests per month must be at least 1');
    }

    if (
      settings.limits?.cost_limit_monthly &&
      settings.limits.cost_limit_monthly < 0
    ) {
      errors.push('Cost limit must be non-negative');
    }

    if (
      settings.security?.password_policy?.min_length &&
      settings.security.password_policy.min_length < 8
    ) {
      warnings.push('Password minimum length should be at least 8 characters');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
    };
  }

  /**
   * Get default system configuration
   */
  private getDefaultSystemConfig(): SystemConfig {
    return {
      deployment_mode: 'cloud',
      license_tier: 'developer',
      license_key: '',
      license_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),

      api: {
        port: 3001,
        host: '0.0.0.0',
        cors_origins: ['http://localhost:3000', 'http://localhost:3001'],
        cors_methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        cors_headers: ['Content-Type', 'Authorization', 'X-API-Key'],
        cors_credentials: true,
        rate_limit_window_ms: 900000, // 15 minutes
        rate_limit_max_requests: 1000,
        request_timeout_ms: 30000,
        max_request_size_mb: 10,
      },

      database: {
        url: 'postgresql://localhost:5432/node2',
        ssl: false,
        pool_size: 10,
        connection_timeout_ms: 5000,
        query_timeout_ms: 30000,
        migration_auto_run: true,
      },

      redis: {
        url: 'redis://localhost:6379',
        db: 0,
        connection_timeout_ms: 5000,
        command_timeout_ms: 5000,
      },

      security: {
        jwt_secret: crypto.randomBytes(32).toString('hex'),
        jwt_expires_in: '24h',
        jwt_refresh_expires_in: '7d',
        encryption_key: crypto.randomBytes(32).toString('hex'),
        encryption_algorithm: 'aes-256-gcm',
        session_timeout: 3600,
        password_min_length: 8,
        password_require_special_chars: true,
        two_factor_required: false,
        sso_enabled: false,
        audit_log_retention_days: 2555, // 7 years
      },

      ai_models: {
        default_provider: 'openai',
        fallback_providers: ['anthropic', 'google'],
        model_selection_strategy: 'balanced',
        max_tokens_per_request: 4000,
        temperature_default: 0.7,
        timeout_per_request_ms: 30000,
        retry_attempts: 3,
        retry_delay_ms: 1000,
      },

      sanitization: {
        enabled: true,
        auto_sanitize: true,
        pii_detection_enabled: true,
        phi_detection_enabled: true,
        custom_patterns_enabled: true,
        tokenization_enabled: true,
        audit_level: 'DETAILED',
        retention_days: 30,
      },

      compliance: {
        gdpr_enabled: false,
        hipaa_enabled: false,
        sox_enabled: false,
        pci_enabled: false,
        data_residency_requirements: [],
        encryption_at_rest: true,
        encryption_in_transit: true,
        audit_trail_enabled: true,
        data_retention_policy_days: 365,
      },

      monitoring: {
        metrics_enabled: true,
        health_checks_enabled: true,
        health_check_interval_seconds: 30,
        performance_tracking_enabled: true,
        error_tracking_enabled: true,
        log_level: 'info',
        log_retention_days: 30,
      },

      backup: {
        enabled: false,
        schedule: '0 2 * * *', // Daily at 2 AM
        retention_days: 30,
        compression_enabled: true,
        encryption_enabled: true,
        storage_location: '/backups',
        max_backup_size_gb: 50,
      },

      features: {
        sanitization: true,
        rag: true,
        model_comparison: true,
        smart_routing: true,
        local_llm: false,
        analytics: true,
        audit_logs: true,
        compliance_reports: false,
        sso: false,
        multi_tenant: true,
        offline_mode: false,
      },

      file_upload: {
        max_file_size_mb: 10,
        allowed_file_types: ['.txt', '.pdf', '.docx', '.csv', '.xlsx'],
        virus_scanning_enabled: false,
        quarantine_suspicious_files: false,
        storage_location: '/uploads',
        cleanup_temp_files_after_hours: 24,
      },

      notifications: {
        email_enabled: false,
        smtp_secure: true,
        webhook_enabled: false,
        slack_enabled: false,
      },
    };
  }

  /**
   * Initialize configuration templates
   */
  private initializeConfigTemplates(): void {
    const templates: ConfigurationTemplate[] = [
      {
        id: 'security-hardened',
        name: 'Security Hardened',
        description:
          'Maximum security configuration for sensitive environments',
        category: 'security',
        is_default: false,
        created_at: new Date(),
        updated_at: new Date(),
        config: {
          security: {
            two_factor_required: true,
            password_min_length: 12,
            password_require_special_chars: true,
            session_timeout: 1800, // 30 minutes
            audit_log_retention_days: 2555,
          },
          compliance: {
            encryption_at_rest: true,
            encryption_in_transit: true,
            audit_trail_enabled: true,
          },
        },
      },
      {
        id: 'compliance-gdpr',
        name: 'GDPR Compliant',
        description: 'Configuration for GDPR compliance',
        category: 'compliance',
        is_default: false,
        created_at: new Date(),
        updated_at: new Date(),
        config: {
          compliance: {
            gdpr_enabled: true,
            data_retention_policy_days: 2555,
            encryption_at_rest: true,
            encryption_in_transit: true,
          },
          security: {
            audit_log_retention_days: 2555,
          },
        },
      },
      {
        id: 'high-performance',
        name: 'High Performance',
        description: 'Optimized for high throughput and low latency',
        category: 'performance',
        is_default: false,
        created_at: new Date(),
        updated_at: new Date(),
        config: {
          api: {
            rate_limit_max_requests: 10000,
            request_timeout_ms: 10000,
          },
          database: {
            pool_size: 50,
            connection_timeout_ms: 1000,
          },
          ai_models: {
            timeout_per_request_ms: 10000,
            retry_attempts: 1,
          },
        },
      },
    ];

    templates.forEach(template => {
      this.configTemplates.set(template.id, template);
    });
  }

  /**
   * Merge configuration objects
   */
  private mergeConfig(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        result[key] = this.mergeConfig(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }
}
