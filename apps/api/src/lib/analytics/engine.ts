import {
  UsageMetrics,
  CostAnalysis,
  PerformanceMetrics,
  UserAnalytics,
  ProviderAnalytics,
  SanitizationAnalytics,
  BusinessMetrics,
  Alert,
  AnalyticsQuery,
} from '../types/analytics';

export class AnalyticsEngine {
  private metrics: Map<string, any> = new Map();
  private alerts: Alert[] = [];
  private alertRules: Map<string, any> = new Map();

  constructor() {
    this.initializeDefaultMetrics();
  }

  /**
   * Track a usage event
   */
  trackUsage(event: {
    organizationId: string;
    userId?: string;
    provider: string;
    model: string;
    tokens: number;
    cost: number;
    latency: number;
    success: boolean;
    endpoint: string;
    timestamp?: Date;
  }): void {
    const timestamp = event.timestamp || new Date();
    const key = `${event.organizationId}_${timestamp.toISOString().split('T')[0]}`;

    // Update daily metrics
    const dailyMetrics = this.metrics.get(key) || {
      requests: 0,
      tokens: 0,
      cost: 0,
      latency: 0,
      errors: 0,
      providers: {},
      models: {},
      users: new Set(),
    };

    dailyMetrics.requests++;
    dailyMetrics.tokens += event.tokens;
    dailyMetrics.cost += event.cost;
    dailyMetrics.latency += event.latency;

    if (!event.success) {
      dailyMetrics.errors++;
    }

    if (event.userId) {
      dailyMetrics.users.add(event.userId);
    }

    // Update provider metrics
    if (!dailyMetrics.providers[event.provider]) {
      dailyMetrics.providers[event.provider] = {
        requests: 0,
        tokens: 0,
        cost: 0,
        latency: 0,
        errors: 0,
      };
    }

    dailyMetrics.providers[event.provider].requests++;
    dailyMetrics.providers[event.provider].tokens += event.tokens;
    dailyMetrics.providers[event.provider].cost += event.cost;
    dailyMetrics.providers[event.provider].latency += event.latency;

    if (!event.success) {
      dailyMetrics.providers[event.provider].errors++;
    }

    // Update model metrics
    if (!dailyMetrics.models[event.model]) {
      dailyMetrics.models[event.model] = {
        requests: 0,
        tokens: 0,
        cost: 0,
        latency: 0,
        errors: 0,
      };
    }

    dailyMetrics.models[event.model].requests++;
    dailyMetrics.models[event.model].tokens += event.tokens;
    dailyMetrics.models[event.model].cost += event.cost;
    dailyMetrics.models[event.model].latency += event.latency;

    if (!event.success) {
      dailyMetrics.models[event.model].errors++;
    }

    this.metrics.set(key, dailyMetrics);

    // Check for alerts
    this.checkAlerts(event);
  }

  /**
   * Track sanitization event
   */
  trackSanitization(event: {
    organizationId: string;
    sessionId: string;
    entitiesDetected: number;
    riskLevel: string;
    processingTime: number;
    complianceFlags: string[];
    timestamp?: Date;
  }): void {
    const timestamp = event.timestamp || new Date();
    const key = `sanitization_${event.organizationId}_${timestamp.toISOString().split('T')[0]}`;

    const sanitizationMetrics = this.metrics.get(key) || {
      totalSanitizations: 0,
      entitiesDetected: 0,
      riskDistribution: {},
      complianceViolations: 0,
      processingTime: 0,
    };

    sanitizationMetrics.totalSanitizations++;
    sanitizationMetrics.entitiesDetected += event.entitiesDetected;
    sanitizationMetrics.processingTime += event.processingTime;

    // Update risk distribution
    sanitizationMetrics.riskDistribution[event.riskLevel] =
      (sanitizationMetrics.riskDistribution[event.riskLevel] || 0) + 1;

    // Count compliance violations
    if (event.complianceFlags.length > 0) {
      sanitizationMetrics.complianceViolations++;
    }

    this.metrics.set(key, sanitizationMetrics);
  }

  /**
   * Get usage metrics
   */
  getUsageMetrics(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ): UsageMetrics {
    const now = new Date();
    const start =
      timeRange?.start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = timeRange?.end || now;

    let totalRequests = 0;
    let totalTokens = 0;
    let totalCost = 0;
    let totalLatency = 0;
    let totalErrors = 0;
    const uniqueUsers = new Set<string>();

    for (const [key, metrics] of this.metrics) {
      if (key.startsWith('sanitization_')) continue;

      const [orgId, dateStr] = key.split('_');
      const date = new Date(dateStr);

      if (organizationId && orgId !== organizationId) continue;
      if (date < start || date > end) continue;

      totalRequests += metrics.requests;
      totalTokens += metrics.tokens;
      totalCost += metrics.cost;
      totalLatency += metrics.latency;
      totalErrors += metrics.errors;

      if (metrics.users) {
        metrics.users.forEach((userId: string) => uniqueUsers.add(userId));
      }
    }

    return {
      totalRequests,
      totalTokens,
      totalCost,
      averageLatency: totalRequests > 0 ? totalLatency / totalRequests : 0,
      errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
      successRate:
        totalRequests > 0 ? (totalRequests - totalErrors) / totalRequests : 0,
      uniqueUsers: uniqueUsers.size,
      activeSessions: 0, // TODO: Implement session tracking
    };
  }

  /**
   * Get cost analysis
   */
  getCostAnalysis(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ): CostAnalysis {
    const now = new Date();
    const start =
      timeRange?.start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const end = timeRange?.end || now;

    let totalCost = 0;
    const costByProvider: Record<string, number> = {};
    const costByModel: Record<string, number> = {};
    const costByOrganization: Record<string, number> = {};
    const dailyCosts: any[] = [];

    for (const [key, metrics] of this.metrics) {
      if (key.startsWith('sanitization_')) continue;

      const [orgId, dateStr] = key.split('_');
      const date = new Date(dateStr);

      if (organizationId && orgId !== organizationId) continue;
      if (date < start || date > end) continue;

      totalCost += metrics.cost;
      costByOrganization[orgId] =
        (costByOrganization[orgId] || 0) + metrics.cost;

      // Aggregate by provider
      for (const [provider, providerMetrics] of Object.entries(
        metrics.providers
      )) {
        costByProvider[provider] =
          (costByProvider[provider] || 0) + (providerMetrics as any).cost;
      }

      // Aggregate by model
      for (const [model, modelMetrics] of Object.entries(metrics.models)) {
        costByModel[model] =
          (costByModel[model] || 0) + (modelMetrics as any).cost;
      }

      // Daily costs
      dailyCosts.push({
        date: dateStr,
        cost: metrics.cost,
        requests: metrics.requests,
        tokens: metrics.tokens,
      });
    }

    return {
      totalCost,
      costByProvider,
      costByModel,
      costByOrganization,
      dailyCosts,
      monthlyCosts: [], // TODO: Implement monthly aggregation
      costTrends: [], // TODO: Implement trend analysis
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ): PerformanceMetrics {
    const usageMetrics = this.getUsageMetrics(organizationId, timeRange);

    return {
      averageLatency: usageMetrics.averageLatency,
      p95Latency: usageMetrics.averageLatency * 1.5, // Mock calculation
      p99Latency: usageMetrics.averageLatency * 2, // Mock calculation
      throughput: usageMetrics.totalRequests / 30, // Requests per day
      errorRate: usageMetrics.errorRate,
      uptime: 99.9, // Mock uptime
      responseTimeByEndpoint: {}, // TODO: Implement endpoint tracking
      responseTimeByProvider: {}, // TODO: Implement provider tracking
    };
  }

  /**
   * Get sanitization analytics
   */
  getSanitizationAnalytics(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ): SanitizationAnalytics {
    const now = new Date();
    const start =
      timeRange?.start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const end = timeRange?.end || now;

    let totalSanitizations = 0;
    let entitiesDetected = 0;
    let complianceViolations = 0;
    let processingTime = 0;
    const riskDistribution: Record<string, number> = {};

    for (const [key, metrics] of this.metrics) {
      if (!key.startsWith('sanitization_')) continue;

      const sanitizationKey = key.replace('sanitization_', '');
      const [orgId, dateStr] = sanitizationKey.split('_');
      const date = new Date(dateStr);

      if (organizationId && orgId !== organizationId) continue;
      if (date < start || date > end) continue;

      totalSanitizations += (metrics.totalSanitizations as any as number) || 0;
      entitiesDetected += (metrics.entitiesDetected as any as number) || 0;
      complianceViolations +=
        (metrics.complianceViolations as any as number) || 0;
      processingTime += (metrics.processingTime as any as number) || 0;

      // Aggregate risk distribution
      for (const [risk, count] of Object.entries(metrics.riskDistribution)) {
        riskDistribution[risk] =
          (riskDistribution[risk] || 0) +
          (typeof count === 'number' ? count : 0);
      }
    }

    return {
      totalSanitizations,
      entitiesDetected,
      riskDistribution,
      complianceViolations,
      sanitizationByType: {}, // TODO: Implement type breakdown
      averageProcessingTime:
        totalSanitizations > 0 ? processingTime / totalSanitizations : 0,
    };
  }

  /**
   * Check for alerts
   */
  private checkAlerts(event: any): void {
    // Mock alert checking - in production, this would check against configured rules
    if (event.cost > 100) {
      this.alerts.push({
        id: `alert_${Date.now()}`,
        ruleId: 'high_cost',
        metric: 'cost',
        value: event.cost,
        threshold: 100,
        severity: 'high',
        message: `High cost detected: $${event.cost}`,
        timestamp: new Date(),
        resolved: false,
      });
    }

    if (event.latency > 5000) {
      this.alerts.push({
        id: `alert_${Date.now()}`,
        ruleId: 'high_latency',
        metric: 'latency',
        value: event.latency,
        threshold: 5000,
        severity: 'medium',
        message: `High latency detected: ${event.latency}ms`,
        timestamp: new Date(),
        resolved: false,
      });
    }
  }

  /**
   * Get alerts
   */
  getAlerts(organizationId?: string, severity?: string): Alert[] {
    return this.alerts.filter(alert => {
      if (organizationId && !alert.message.includes(organizationId))
        return false;
      if (severity && alert.severity !== severity) return false;
      return true;
    });
  }

  /**
   * Get analytics query results
   */
  queryAnalytics(query: AnalyticsQuery): any {
    // Mock implementation - in production, this would query a proper analytics database
    return {
      data: [],
      total: 0,
      aggregations: {},
    };
  }

  /**
   * Initialize default metrics
   */
  private initializeDefaultMetrics(): void {
    // Initialize with some mock data for demonstration
    const today = new Date().toISOString().split('T')[0];
    this.metrics.set(`default-org_${today}`, {
      requests: 150,
      tokens: 45000,
      cost: 25.5,
      latency: 1200,
      errors: 3,
      providers: {
        openai: {
          requests: 100,
          tokens: 30000,
          cost: 20.0,
          latency: 1000,
          errors: 2,
        },
        anthropic: {
          requests: 50,
          tokens: 15000,
          cost: 5.5,
          latency: 1400,
          errors: 1,
        },
      },
      models: {
        'gpt-4': {
          requests: 80,
          tokens: 24000,
          cost: 16.0,
          latency: 1200,
          errors: 1,
        },
        'gpt-3.5-turbo': {
          requests: 70,
          tokens: 21000,
          cost: 9.5,
          latency: 800,
          errors: 2,
        },
      },
      users: new Set(['user1', 'user2', 'user3']),
    });
  }
}
