'use client';

import { useState, useEffect } from 'react';

export type HealthStatus = 'healthy' | 'unhealthy' | 'checking';

interface HealthCheckResult {
  status: HealthStatus;
  lastChecked: Date | null;
  error?: string;
}

export function useHealthStatus() {
  const [healthStatus, setHealthStatus] = useState<HealthCheckResult>({
    status: 'checking',
    lastChecked: null,
  });

  const checkHealth = async () => {
    try {
      setHealthStatus(prev => ({ ...prev, status: 'checking' }));

      // Try to reach the API health endpoint
      const response = await fetch('/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        setHealthStatus({
          status: 'healthy',
          lastChecked: new Date(),
        });
      } else {
        setHealthStatus({
          status: 'unhealthy',
          lastChecked: new Date(),
          error: `HTTP ${response.status}`,
        });
      }
    } catch (error) {
      setHealthStatus({
        status: 'unhealthy',
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  };

  useEffect(() => {
    // Initial health check
    checkHealth();

    // Set up periodic health checks every 30 seconds
    const interval = setInterval(checkHealth, 30000);

    return () => clearInterval(interval);
  }, []);

  return {
    ...healthStatus,
    checkHealth,
  };
}
