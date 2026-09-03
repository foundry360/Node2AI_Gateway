import { ChatResponse } from '../types/providers';
import { query } from '../db/postgres-client';
import { usageEventBuffer } from './usage-event-buffer';

export interface CostMetrics {
  totalCost: number;
  costByProvider: { [provider: string]: number };
  costByModel: { [model: string]: number };
  costByOrganization: { [organizationId: string]: number };
  averageCostPerRequest: number;
  costTrends: {
    daily: { date: string; cost: number }[];
    weekly: { week: string; cost: number }[];
    monthly: { month: string; cost: number }[];
  };
}

export interface UsageEvent {
  id: string;
  organizationId: string;
  userId?: string;
  apiKeyId?: string;
  conversationId?: string;
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  cost: number;
  latency: number;
  timestamp: Date;
  success: boolean;
  errorMessage?: string;
  requestId?: string;
  dataSanitized?: boolean;
  sanitizationCount?: number;
}

export class CostCalculator {
  private usageEvents: UsageEvent[] = [];

  async trackUsage(event: Omit<UsageEvent, 'id' | 'timestamp'>): Promise<void> {
    const usageEvent: UsageEvent = {
      ...event,
      id: `usage_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      timestamp: new Date(),
    };

    // Store in memory for quick access
    this.usageEvents.push(usageEvent);

    // Persist to database asynchronously
    this.persistUsageEvent(usageEvent).catch(error => {
      console.error('Failed to persist usage event:', error);
    });

    console.log(
      `Tracked usage: ${event.provider}/${event.model} - $${event.cost.toFixed(6)}`
    );
  }

  getCostMetrics(
    organizationId?: string,
    timeRange?: { start: Date; end: Date }
  ): CostMetrics {
    let filteredEvents = this.usageEvents;

    // Filter by organization if specified
    if (organizationId) {
      filteredEvents = filteredEvents.filter(
        event => event.organizationId === organizationId
      );
    }

    // Filter by time range if specified
    if (timeRange) {
      filteredEvents = filteredEvents.filter(
        event =>
          event.timestamp >= timeRange.start && event.timestamp <= timeRange.end
      );
    }

    const totalCost = filteredEvents.reduce(
      (sum, event) => sum + event.cost,
      0
    );
    const totalRequests = filteredEvents.length;
    const averageCostPerRequest =
      totalRequests > 0 ? totalCost / totalRequests : 0;

    // Calculate cost by provider
    const costByProvider: { [provider: string]: number } = {};
    filteredEvents.forEach(event => {
      costByProvider[event.provider] =
        (costByProvider[event.provider] || 0) + event.cost;
    });

    // Calculate cost by model
    const costByModel: { [model: string]: number } = {};
    filteredEvents.forEach(event => {
      costByModel[event.model] = (costByModel[event.model] || 0) + event.cost;
    });

    // Calculate cost by organization
    const costByOrganization: { [organizationId: string]: number } = {};
    filteredEvents.forEach(event => {
      costByOrganization[event.organizationId] =
        (costByOrganization[event.organizationId] || 0) + event.cost;
    });

    // Calculate trends
    const costTrends = this.calculateTrends(filteredEvents);

    return {
      totalCost,
      costByProvider,
      costByModel,
      costByOrganization,
      averageCostPerRequest,
      costTrends,
    };
  }

  private calculateTrends(events: UsageEvent[]): CostMetrics['costTrends'] {
    const daily: { [date: string]: number } = {};
    const weekly: { [week: string]: number } = {};
    const monthly: { [month: string]: number } = {};

    events.forEach(event => {
      const date = event.timestamp.toISOString().split('T')[0];
      const week = this.getWeekString(event.timestamp);
      const month = event.timestamp.toISOString().substring(0, 7);

      daily[date] = (daily[date] || 0) + event.cost;
      weekly[week] = (weekly[week] || 0) + event.cost;
      monthly[month] = (monthly[month] || 0) + event.cost;
    });

    return {
      daily: Object.entries(daily).map(([date, cost]) => ({ date, cost })),
      weekly: Object.entries(weekly).map(([week, cost]) => ({ week, cost })),
      monthly: Object.entries(monthly).map(([month, cost]) => ({
        month,
        cost,
      })),
    };
  }

  private getWeekString(date: Date): string {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${week.toString().padStart(2, '0')}`;
  }

  private getWeekNumber(date: Date): number {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear =
      (date.getTime() - firstDayOfYear.getTime()) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  getProviderCostComparison(): {
    provider: string;
    totalCost: number;
    averageCost: number;
    requestCount: number;
  }[] {
    const providerStats: {
      [provider: string]: { totalCost: number; requestCount: number };
    } = {};

    this.usageEvents.forEach(event => {
      if (!providerStats[event.provider]) {
        providerStats[event.provider] = { totalCost: 0, requestCount: 0 };
      }
      providerStats[event.provider].totalCost += event.cost;
      providerStats[event.provider].requestCount += 1;
    });

    return Object.entries(providerStats).map(([provider, stats]) => ({
      provider,
      totalCost: stats.totalCost,
      averageCost:
        stats.requestCount > 0 ? stats.totalCost / stats.requestCount : 0,
      requestCount: stats.requestCount,
    }));
  }

  getModelCostComparison(): {
    model: string;
    totalCost: number;
    averageCost: number;
    requestCount: number;
  }[] {
    const modelStats: {
      [model: string]: { totalCost: number; requestCount: number };
    } = {};

    this.usageEvents.forEach(event => {
      if (!modelStats[event.model]) {
        modelStats[event.model] = { totalCost: 0, requestCount: 0 };
      }
      modelStats[event.model].totalCost += event.cost;
      modelStats[event.model].requestCount += 1;
    });

    return Object.entries(modelStats).map(([model, stats]) => ({
      model,
      totalCost: stats.totalCost,
      averageCost:
        stats.requestCount > 0 ? stats.totalCost / stats.requestCount : 0,
      requestCount: stats.requestCount,
    }));
  }

  getCostAlerts(thresholds: {
    daily: number;
    weekly: number;
    monthly: number;
  }): string[] {
    const alerts: string[] = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(today);
    thisWeek.setDate(today.getDate() - today.getDay());
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Check daily cost
    const dailyCost = this.getCostMetrics(undefined, {
      start: today,
      end: now,
    }).totalCost;
    if (dailyCost > thresholds.daily) {
      alerts.push(
        `Daily cost threshold exceeded: $${dailyCost.toFixed(2)} > $${thresholds.daily}`
      );
    }

    // Check weekly cost
    const weeklyCost = this.getCostMetrics(undefined, {
      start: thisWeek,
      end: now,
    }).totalCost;
    if (weeklyCost > thresholds.weekly) {
      alerts.push(
        `Weekly cost threshold exceeded: $${weeklyCost.toFixed(2)} > $${thresholds.weekly}`
      );
    }

    // Check monthly cost
    const monthlyCost = this.getCostMetrics(undefined, {
      start: thisMonth,
      end: now,
    }).totalCost;
    if (monthlyCost > thresholds.monthly) {
      alerts.push(
        `Monthly cost threshold exceeded: $${monthlyCost.toFixed(2)} > $${thresholds.monthly}`
      );
    }

    return alerts;
  }

  // Persist usage event to PostgreSQL database (using buffer for performance)
  private async persistUsageEvent(event: UsageEvent): Promise<void> {
    try {
      // Use buffered write instead of immediate insert for better performance
      await usageEventBuffer.addEvent(event);
    } catch (error: any) {
      // Log error but don't throw - usage tracking shouldn't break the request
      console.error('Failed to add usage event to buffer:', error);
      console.error('Error details:', {
        message: error?.message,
        code: error?.code,
        detail: error?.detail,
      });

      // If the error is due to missing conversation_id column, try without it (backward compatibility)
      if (
        error?.message?.includes('conversation_id') ||
        error?.code === '42703'
      ) {
        console.log(
          'Retrying insert without conversation_id column (backward compatibility)...'
        );
        try {
          await query(
            `INSERT INTO usage_events (
              organization_id,
              api_key_id,
              user_id,
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
              request_id,
              timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
              event.organizationId,
              event.apiKeyId || null,
              event.userId || null,
              event.provider,
              event.model,
              event.tokensInput,
              event.tokensOutput,
              event.cost,
              event.latency,
              event.success ? 'success' : 'error',
              event.errorMessage || null,
              event.dataSanitized || false,
              event.sanitizationCount || 0,
              event.requestId || null,
              event.timestamp,
            ]
          );
          console.log(
            'Successfully persisted usage event without conversation_id'
          );
        } catch (retryError: any) {
          console.error(
            'Failed to persist usage event even without conversation_id:',
            retryError
          );
        }
      }
    }
  }

  /**
   * Get costs grouped by conversation and model
   */
  async getConversationCosts(
    organizationId: string,
    conversationId?: string
  ): Promise<
    Array<{
      conversationId: string;
      model: string;
      provider: string;
      totalCost: number;
      totalTokens: number;
      requestCount: number;
      avgLatency: number;
    }>
  > {
    try {
      const conversationFilter = conversationId
        ? 'AND conversation_id = $2'
        : '';
      const params = conversationId
        ? [organizationId, conversationId]
        : [organizationId];

      const result = await query(
        `SELECT 
          conversation_id,
          model,
          provider,
          SUM(cost) as total_cost,
          SUM(tokens_input + tokens_output) as total_tokens,
          COUNT(*) as request_count,
          AVG(latency_ms) as avg_latency
        FROM usage_events
        WHERE organization_id = $1 
          AND conversation_id IS NOT NULL
          ${conversationFilter}
        GROUP BY conversation_id, model, provider
        ORDER BY total_cost DESC`,
        params
      );

      return result.rows.map((row: any) => ({
        conversationId: row.conversation_id,
        model: row.model,
        provider: row.provider,
        totalCost: parseFloat(row.total_cost || '0'),
        totalTokens: parseInt(row.total_tokens || '0'),
        requestCount: parseInt(row.request_count || '0'),
        avgLatency: parseFloat(row.avg_latency || '0'),
      }));
    } catch (error) {
      console.error('Error fetching conversation costs:', error);
      return [];
    }
  }
}
