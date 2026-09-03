import * as crypto from 'crypto';
import { getCache, setCache, deleteCache } from './redis-client';
import { Message, ChatResponse } from '../types/providers';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  enabled?: boolean;
}

export class ResponseCache {
  private defaultTtl: number;
  private enabled: boolean;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttl || 3600; // Default 1 hour
    this.enabled = options.enabled ?? true;
  }

  /**
   * Generate cache key from messages and model
   */
  private generateCacheKey(
    messages: Message[],
    model: string,
    temperature?: number
  ): string {
    // Create a hash of the messages content
    const contentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ messages, model, temperature }))
      .digest('hex');
    return `ai:response:${model}:${contentHash}`;
  }

  /**
   * Get cached response if available
   */
  async getCachedResponse(
    messages: Message[],
    model: string,
    temperature?: number
  ): Promise<ChatResponse | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const cacheKey = this.generateCacheKey(messages, model, temperature);
      const cached = await getCache(cacheKey);

      if (cached) {
        const response = JSON.parse(cached) as ChatResponse;
        // Add cache metadata
        return {
          ...response,
          cached: true,
        } as any;
      }

      return null;
    } catch (error) {
      console.error('[ResponseCache] Error getting cached response:', error);
      return null;
    }
  }

  /**
   * Cache a response
   */
  async cacheResponse(
    messages: Message[],
    model: string,
    response: ChatResponse,
    ttl?: number
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const cacheKey = this.generateCacheKey(
        messages,
        model,
        (response as any).temperature
      );
      const ttlSeconds = ttl || this.defaultTtl;

      // Don't cache error responses or streaming responses
      if ((response as any).error || (response as any).stream) {
        return;
      }

      await setCache(cacheKey, JSON.stringify(response), ttlSeconds);
    } catch (error) {
      console.error('[ResponseCache] Error caching response:', error);
      // Don't throw - caching failures shouldn't break requests
    }
  }

  /**
   * Invalidate cache for a specific model or all models
   */
  async invalidateCache(model?: string): Promise<void> {
    try {
      if (model) {
        // Invalidate specific model cache
        const pattern = `ai:response:${model}:*`;
        // Note: Redis pattern deletion requires SCAN, which is more complex
        // For now, we'll just log - full implementation would use SCAN
        console.log(
          `[ResponseCache] Cache invalidation requested for ${model}`
        );
      } else {
        // Clear all response cache
        console.log('[ResponseCache] Full cache invalidation requested');
      }
    } catch (error) {
      console.error('[ResponseCache] Error invalidating cache:', error);
    }
  }

  /**
   * Check if caching is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Export singleton instance
export const responseCache = new ResponseCache({
  ttl: parseInt(process.env.RESPONSE_CACHE_TTL || '3600'),
  enabled: process.env.ENABLE_RESPONSE_CACHE !== 'false',
});
