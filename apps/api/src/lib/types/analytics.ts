export interface UsageMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  errorRate: number;
  successRate: number;
  uniqueUsers: number;
  activeSessions: number;
}

export interface CostAnalysis {
  totalCost: number;
  costByProvider: Record<string, number>;
  costByModel: Record<string, number>;
  costByOrganization: Record<string, number>;
  dailyCosts: DailyCost[];
  monthlyCosts: MonthlyCost[];
  costTrends: CostTrend[];
}

export interface DailyCost {
  date: string;
  cost: number;
  requests: number;
  tokens: number;
}

export interface MonthlyCost {
  month: string;
  cost: number;
  requests: number;
  tokens: number;
  growth: number;
}

export interface CostTrend {
  period: string;
  cost: number;
  change: number;
  changePercent: number;
}

export interface PerformanceMetrics {
  averageLatency: number;
  p95Latency: number;
  p99Latency: number;
  throughput: number;
  errorRate: number;
  uptime: number;
  responseTimeByEndpoint: Record<string, number>;
  responseTimeByProvider: Record<string, number>;
}

export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  userRetention: number;
  userEngagement: UserEngagement[];
  userSegments: UserSegment[];
}

export interface UserEngagement {
  userId: string;
  sessionCount: number;
  totalRequests: number;
  lastActive: Date;
  averageSessionDuration: number;
}

export interface UserSegment {
  segment: string;
  userCount: number;
  averageUsage: number;
  averageCost: number;
}

export interface ProviderAnalytics {
  provider: string;
  requestCount: number;
  tokenCount: number;
  cost: number;
  averageLatency: number;
  errorRate: number;
  successRate: number;
  modelBreakdown: ModelAnalytics[];
}

export interface ModelAnalytics {
  model: string;
  requestCount: number;
  tokenCount: number;
  cost: number;
  averageLatency: number;
  errorRate: number;
  usage: number;
}

export interface SanitizationAnalytics {
  totalSanitizations: number;
  entitiesDetected: number;
  riskDistribution: Record<string, number>;
  complianceViolations: number;
  sanitizationByType: Record<string, number>;
  averageProcessingTime: number;
}

export interface BusinessMetrics {
  revenue: number;
  customerCount: number;
  averageRevenuePerUser: number;
  customerLifetimeValue: number;
  churnRate: number;
  growthRate: number;
  marketShare: number;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  severity: 'low' | 'medium' | 'high' | 'critical';
  enabled: boolean;
  notificationChannels: string[];
}

export interface Alert {
  id: string;
  ruleId: string;
  metric: string;
  value: number;
  threshold: number;
  severity: string;
  message: string;
  timestamp: Date;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface DashboardConfig {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  layout: DashboardLayout;
  filters: DashboardFilter[];
  refreshInterval: number;
  isPublic: boolean;
  organizationId: string;
}

export interface DashboardWidget {
  id: string;
  type: 'chart' | 'metric' | 'table' | 'gauge' | 'map';
  title: string;
  dataSource: string;
  config: Record<string, any>;
  position: { x: number; y: number; w: number; h: number };
}

export interface DashboardLayout {
  columns: number;
  rows: number;
  breakpoints: Record<string, any>;
}

export interface DashboardFilter {
  field: string;
  operator: string;
  value: any;
  label: string;
}

export interface ReportConfig {
  id: string;
  name: string;
  description: string;
  schedule: string;
  format: 'pdf' | 'csv' | 'json' | 'html';
  recipients: string[];
  template: string;
  filters: Record<string, any>;
  organizationId: string;
}

export interface AnalyticsQuery {
  metric: string;
  dimensions: string[];
  filters: Record<string, any>;
  timeRange: {
    start: Date;
    end: Date;
  };
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
  groupBy: string[];
  orderBy: string;
  limit: number;
}
