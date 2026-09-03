import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;

/**
 * Get or create Redis client (singleton pattern)
 */
export function getRedisClient(): RedisClient | null {
  if (redisClient) {
    return redisClient;
  }

  try {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: retries => {
          if (retries > 10) {
            console.error('Redis: Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    redisClient.on('error', err => {
      console.error('Redis Client Error:', err);
    });

    redisClient.on('connect', () => {
      console.log('Redis: Connected');
    });

    redisClient.on('reconnecting', () => {
      console.log('Redis: Reconnecting...');
    });

    // Connect to Redis (don't await - let it connect in background)
    redisClient.connect().catch(err => {
      console.error('Redis: Failed to connect:', err);
      redisClient = null;
    });

    return redisClient;
  } catch (error) {
    console.error('Redis: Failed to create client:', error);
    return null;
  }
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.ping();
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get cache value
 */
export async function getCache(key: string): Promise<string | null> {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  try {
    const value = await client.get(key);
    return value;
  } catch (error) {
    console.error(`Redis: Failed to get key ${key}:`, error);
    return null;
  }
}

/**
 * Set cache value with TTL (time to live in seconds)
 */
export async function setCache(
  key: string,
  value: string,
  ttlSeconds: number = 300
): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.setEx(key, ttlSeconds, value);
    return true;
  } catch (error) {
    console.error(`Redis: Failed to set key ${key}:`, error);
    return false;
  }
}

/**
 * Delete cache value
 */
export async function deleteCache(key: string): Promise<boolean> {
  const client = getRedisClient();
  if (!client) {
    return false;
  }

  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.error(`Redis: Failed to delete key ${key}:`, error);
    return false;
  }
}

/**
 * Get Redis statistics for cache monitoring
 */
export async function getRedisStats(): Promise<{
  hitRate: number;
  memory: { used: number; total: number };
  status: 'healthy' | 'degraded' | 'not_configured';
}> {
  const client = getRedisClient();
  if (!client) {
    return {
      hitRate: 0,
      memory: { used: 0, total: 0 },
      status: 'not_configured',
    };
  }

  try {
    // Check if Redis is connected
    await client.ping();

    // Get Redis INFO
    const info = await client.info('stats');
    const memoryInfo = await client.info('memory');

    // Parse stats
    const statsMatch = info.match(/keyspace_hits:(\d+)/);
    const missesMatch = info.match(/keyspace_misses:(\d+)/);
    const usedMemoryMatch = memoryInfo.match(/used_memory:(\d+)/);
    const maxMemoryMatch = memoryInfo.match(/maxmemory:(\d+)/);

    const hits = parseInt(statsMatch?.[1] || '0');
    const misses = parseInt(missesMatch?.[1] || '0');
    const usedMemory = parseInt(usedMemoryMatch?.[1] || '0');
    const maxMemory = parseInt(maxMemoryMatch?.[1] || '0');

    // Calculate hit rate
    const total = hits + misses;
    const hitRate = total > 0 ? Math.round((hits / total) * 100) : 0;

    // Convert bytes to MB
    const usedMB = Math.round(usedMemory / (1024 * 1024));
    const totalMB = maxMemory > 0 ? Math.round(maxMemory / (1024 * 1024)) : 256; // Default to 256MB if maxmemory not set

    // Determine status based on memory usage and hit rate
    let status: 'healthy' | 'degraded' | 'not_configured' = 'healthy';
    const memoryUsagePercent =
      maxMemory > 0 ? (usedMemory / maxMemory) * 100 : 0;

    if (memoryUsagePercent > 90 || hitRate < 50) {
      status = 'degraded';
    }

    return {
      hitRate,
      memory: {
        used: usedMB,
        total: totalMB,
      },
      status,
    };
  } catch (error) {
    console.error('Redis: Failed to get stats:', error);
    return {
      hitRate: 0,
      memory: { used: 0, total: 0 },
      status: 'not_configured',
    };
  }
}

/**
 * Close Redis connection (for cleanup)
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
      redisClient = null;
      console.log('Redis: Connection closed');
    } catch (error) {
      console.error('Redis: Failed to close connection:', error);
    }
  }
}
