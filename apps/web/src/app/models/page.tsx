'use client';

import { useState, useEffect, useCallback } from 'react';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { PageLayout } from '@/components/page-layout';
import { useAuth } from '@/contexts/AuthContext';

interface ModelInfo {
  name: string;
  provider: string;
  status: 'active' | 'inactive' | 'error';
  cost_per_1k_tokens: number;
  total_tokens: number;
  capabilities: string[];
  last_used?: string;
  total_requests: number;
  avg_latency: number;
}

export default function ModelsPage() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  const loadModels = useCallback(async () => {
    try {
      setLoading(true);

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      } else {
        setModels([]);
        setLoading(false);
        return;
      }

      // Fetch real model data from dashboard API
      const response = await fetch('/api/v1/control-center/dashboard', {
        headers,
      });
      const result = await response.json();

      if (result.success && result.data.models) {
        // Transform dashboard model data to ModelInfo format
        const transformedModels: ModelInfo[] = result.data.models.map(
          (m: any) => ({
            name: m.name,
            provider: m.provider.charAt(0).toUpperCase() + m.provider.slice(1),
            status:
              m.status === 'healthy'
                ? 'active'
                : m.status === 'error'
                  ? 'error'
                  : 'inactive',
            cost_per_1k_tokens:
              m.totalTokens > 0 ? (m.totalCost / m.totalTokens) * 1000 : 0,
            total_tokens: Number(m.totalTokens || 0),
            capabilities: [], // Not available from dashboard
            last_used: m.lastUsed || undefined,
            total_requests: m.requestCount,
            avg_latency: Math.round(Number(m.avgLatency || 0)),
          })
        );
        setModels(transformedModels);
      } else {
        // Fallback to empty array if no data
        setModels([]);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
      setModels([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  if (loading) {
    return (
      <PageLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Loading models...
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[95%] px-4 pb-6 pt-2 sm:px-6 lg:px-8 xl:max-w-[98%]">
        {/* Page Heading */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            AI Models
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            View and manage all available AI models across providers
          </p>
        </div>

        {/* Models Grid - Grouped by Provider */}
        {(() => {
          // Group models by provider
          const modelsByProvider = models.reduce(
            (acc, model) => {
              const provider = model.provider.toLowerCase();
              if (!acc[provider]) {
                acc[provider] = [];
              }
              acc[provider].push(model);
              return acc;
            },
            {} as Record<string, ModelInfo[]>
          );

          return Object.entries(modelsByProvider).length > 0 ? (
            Object.entries(modelsByProvider).map(
              ([provider, providerModels]) => (
                <div key={provider} className="mb-8">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
                    {provider.charAt(0).toUpperCase() + provider.slice(1)}
                  </h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {providerModels.map(model => (
                      <ModelCard key={model.name} model={model} />
                    ))}
                  </div>
                </div>
              )
            )
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-[#242424] dark:bg-[#000000]">
              <p className="text-gray-500 dark:text-gray-400">
                No model usage data available yet. Make some API requests to see
                model statistics.
              </p>
            </div>
          );
        })()}
      </div>
    </PageLayout>
  );
}

// Model Card Component
function ModelCard({ model }: { model: ModelInfo }) {
  const statusColors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    error: 'bg-red-100 text-red-800',
  };

  const statusIcons = {
    active: CheckCircleIcon,
    inactive: XCircleIcon,
    error: XCircleIcon,
  };

  const StatusIcon = statusIcons[model.status];

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="card-title text-lg">{model.name}</h3>
            <p className="card-description">{model.provider}</p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[model.status]}`}
          >
            <StatusIcon className="mr-1 h-3 w-3" />
            {model.status}
          </span>
        </div>
      </div>

      <div className="card-content space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Cost per 1K tokens
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {model.total_requests === 0
                ? 'N/A'
                : model.cost_per_1k_tokens === 0
                  ? '$0.0000'
                  : `$${model.cost_per_1k_tokens.toFixed(4)}`}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total tokens
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {model.total_tokens.toLocaleString()}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
            Capabilities
          </p>
          <div className="flex flex-wrap gap-1">
            {model.capabilities.map(capability => (
              <span
                key={capability}
                className="inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-xs text-blue-800"
              >
                {capability}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-[#242424] pt-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Total requests
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {model.total_requests.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Avg Latency
            </p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {model.avg_latency}ms
            </p>
          </div>
        </div>

        {model.last_used && (
          <div className="border-t border-[#242424] pt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Last used
            </p>
            <p className="text-sm text-gray-900 dark:text-white">
              {new Date(model.last_used).toLocaleString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
