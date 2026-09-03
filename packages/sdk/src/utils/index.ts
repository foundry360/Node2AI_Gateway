// SDK utility functions

import { SupernovaClient, SupernovaClientConfig } from '../client';
import { AxiosRequestConfig } from 'axios';

/**
 * Retry function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Create a client with automatic retry
 */
export function createClientWithRetry(
  config: SupernovaClientConfig,
  maxRetries: number = 3
): SupernovaClient {
  const client = new SupernovaClient(config);

  // Wrap all client methods with retry logic
  const originalRequest = client.request.bind(client);
  client.request = async (requestConfig: AxiosRequestConfig) => {
    return retry(() => originalRequest(requestConfig), maxRetries);
  };

  return client;
}

/**
 * Validate client configuration
 */
export function validateConfig(config: SupernovaClientConfig): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.baseUrl) {
    errors.push('baseUrl is required');
  }

  if (!config.apiKey) {
    errors.push('apiKey is required');
  }

  if (
    config.timeout &&
    (typeof config.timeout !== 'number' || config.timeout <= 0)
  ) {
    errors.push('timeout must be a positive number');
  }

  if (
    config.retries &&
    (typeof config.retries !== 'number' || config.retries < 0)
  ) {
    errors.push('retries must be a non-negative number');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Create a client from environment variables
 */
export function createClientFromEnv(): SupernovaClient {
  const config: SupernovaClientConfig = {
    baseUrl: process.env.SUPERNOVA_BASE_URL || 'http://localhost:3001',
    apiKey: process.env.SUPERNOVA_API_KEY || '',
    timeout: process.env.SUPERNOVA_TIMEOUT
      ? parseInt(process.env.SUPERNOVA_TIMEOUT)
      : undefined,
    debug: process.env.SUPERNOVA_DEBUG === 'true',
    version: process.env.SUPERNOVA_VERSION || 'v1',
  };

  const validation = validateConfig(config);
  if (!validation.isValid) {
    throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
  }

  return new SupernovaClient(config);
}

/**
 * Wait for client to be ready
 */
export async function waitForClient(
  client: SupernovaClient,
  timeout: number = 30000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      await client.health.check();
      return;
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw new Error('Client health check timeout');
}

/**
 * Create a batch processor for multiple operations
 */
export class BatchProcessor<T, R> {
  private operations: Array<() => Promise<R>> = [];

  add(operation: () => Promise<R>): void {
    this.operations.push(operation);
  }

  async execute(concurrency: number = 5): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < this.operations.length; i += concurrency) {
      const batch = this.operations.slice(i, i + concurrency);
      const batchResults = await Promise.all(batch.map(op => op()));
      results.push(...batchResults);
    }

    return results;
  }

  clear(): void {
    this.operations = [];
  }

  get count(): number {
    return this.operations.length;
  }
}

/**
 * Create a rate limiter
 */
export class RateLimiter {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;

  constructor(
    private maxConcurrent: number = 10,
    private delayMs: number = 100
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    this.running++;
    const operation = this.queue.shift()!;

    try {
      await operation();
    } finally {
      this.running--;
      if (this.delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, this.delayMs));
      }
      this.process();
    }
  }
}

/**
 * Create a cache for API responses
 */
export class ApiCache {
  private cache = new Map<
    string,
    { data: any; timestamp: number; ttl: number }
  >();

  set(key: string, data: any, ttlMs: number = 300000): void {
    // 5 minutes default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  get size(): number {
    return this.cache.size;
  }
}
