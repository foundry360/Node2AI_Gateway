import { query } from '../db/postgres-client';
import { UsageEvent } from './cost-calculator';

/**
 * Buffers usage events and writes them in batches to improve performance
 * This reduces database write overhead and improves request latency
 */
export class UsageEventBuffer {
  private buffer: UsageEvent[] = [];
  private flushInterval: number;
  private maxBufferSize: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private isFlushing: boolean = false;

  constructor(
    flushIntervalMs: number = 5000, // Flush every 5 seconds
    maxBufferSize: number = 100 // Flush when buffer reaches 100 events
  ) {
    this.flushInterval = flushIntervalMs;
    this.maxBufferSize = maxBufferSize;
    this.startFlushTimer();
  }

  /**
   * Add usage event to buffer
   */
  async addEvent(event: UsageEvent): Promise<void> {
    this.buffer.push(event);

    // Flush if buffer is full
    if (this.buffer.length >= this.maxBufferSize) {
      await this.flush();
    }
  }

  /**
   * Start periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        this.flush().catch(error => {
          console.error('[UsageEventBuffer] Error in scheduled flush:', error);
        });
      }
    }, this.flushInterval);
  }

  /**
   * Flush buffer to database
   */
  async flush(): Promise<void> {
    if (this.isFlushing || this.buffer.length === 0) {
      return;
    }

    this.isFlushing = true;
    const eventsToFlush = [...this.buffer];
    this.buffer = [];

    try {
      // Batch insert using PostgreSQL's VALUES clause
      if (eventsToFlush.length === 0) {
        this.isFlushing = false;
        return;
      }

      // Build batch insert query
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const event of eventsToFlush) {
        const row = [
          event.organizationId,
          event.apiKeyId || null,
          event.userId || null,
          event.conversationId || null,
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
        ];

        const rowPlaceholders = row.map(() => `$${paramIndex++}`).join(', ');
        placeholders.push(`(${rowPlaceholders})`);
        values.push(...row);
      }

      const queryText = `
        INSERT INTO usage_events (
          organization_id,
          api_key_id,
          user_id,
          conversation_id,
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
        ) VALUES ${placeholders.join(', ')}
      `;

      await query(queryText, values);
    } catch (error: any) {
      // Log error but don't throw - usage tracking shouldn't break the app
      console.error('[UsageEventBuffer] Failed to flush usage events:', error);
      // Re-add events to buffer for retry (but limit to prevent memory issues)
      if (this.buffer.length < this.maxBufferSize * 2) {
        this.buffer.unshift(...eventsToFlush);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Force immediate flush (useful for shutdown)
   */
  async forceFlush(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /**
   * Get current buffer size
   */
  getBufferSize(): number {
    return this.buffer.length;
  }
}

// Export singleton instance
export const usageEventBuffer = new UsageEventBuffer(
  parseInt(process.env.USAGE_EVENT_FLUSH_INTERVAL_MS || '5000'),
  parseInt(process.env.USAGE_EVENT_BUFFER_SIZE || '100')
);
