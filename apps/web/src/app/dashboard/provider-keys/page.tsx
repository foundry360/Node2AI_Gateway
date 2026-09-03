'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Trash2,
  TestTube,
  Plus,
  Key,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';

interface ProviderKey {
  id: string;
  provider: string;
  keyMetadata: {
    model?: string;
    region?: string;
    environment?: string;
    description?: string;
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastTestedAt?: string;
  lastTestStatus?: 'success' | 'failed';
  lastTestError?: string;
  encryptedKey: string;
}

interface TestResult {
  success: boolean;
  latency?: number;
  error?: string;
  models?: string[];
  capabilities?: {
    streaming: boolean;
    functionCalling: boolean;
    vision: boolean;
    embeddings: boolean;
  };
}

const PROVIDERS = [
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT-4, GPT-3.5, and other models',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude-3 and other models',
  },
  {
    value: 'google',
    label: 'Google',
    description: 'Gemini Pro and other models',
  },
  {
    value: 'perplexity',
    label: 'Perplexity',
    description: 'Perplexity AI models',
  },
];

export default function ProviderKeysPage() {
  const [providerKeys, setProviderKeys] = useState<ProviderKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingKeys, setTestingKeys] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, TestResult>>(
    {}
  );

  // Form state
  const [formData, setFormData] = useState({
    provider: '',
    apiKey: '',
    model: '',
    region: '',
    environment: '',
    description: '',
  });

  // Load provider keys
  useEffect(() => {
    loadProviderKeys();
  }, []);

  const loadProviderKeys = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/v1/provider-keys', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load provider keys');
      }

      const data = await response.json();
      setProviderKeys(data.data.provider_keys);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load provider keys'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAddProviderKey = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch('/api/v1/provider-keys', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: formData.provider,
          apiKey: formData.apiKey,
          keyMetadata: {
            model: formData.model || undefined,
            region: formData.region || undefined,
            environment: formData.environment || undefined,
            description: formData.description || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create provider key');
      }

      // Reset form and reload data
      setFormData({
        provider: '',
        apiKey: '',
        model: '',
        region: '',
        environment: '',
        description: '',
      });
      setShowAddForm(false);
      await loadProviderKeys();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to create provider key'
      );
    }
  };

  const handleTestProviderKey = async (keyId: string) => {
    try {
      setTestingKeys(prev => new Set(prev).add(keyId));

      const response = await fetch(`/api/v1/provider-keys/${keyId}/test`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      if (data.success) {
        setTestResults(prev => ({
          ...prev,
          [keyId]: data.data.test_result,
        }));
        await loadProviderKeys(); // Reload to get updated test status
      } else {
        setTestResults(prev => ({
          ...prev,
          [keyId]: {
            success: false,
            error: data.message,
          },
        }));
      }
    } catch (err) {
      setTestResults(prev => ({
        ...prev,
        [keyId]: {
          success: false,
          error: err instanceof Error ? err.message : 'Test failed',
        },
      }));
    } finally {
      setTestingKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(keyId);
        return newSet;
      });
    }
  };

  const handleDeleteProviderKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this provider key?')) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/provider-keys/${keyId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete provider key');
      }

      await loadProviderKeys();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to delete provider key'
      );
    }
  };

  const getStatusIcon = (key: ProviderKey) => {
    if (testingKeys.has(key.id)) {
      return <Clock className="h-4 w-4 text-yellow-500" />;
    }

    if (key.lastTestStatus === 'success') {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    } else if (key.lastTestStatus === 'failed') {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }

    return <Clock className="h-4 w-4 text-gray-400" />;
  };

  const getStatusText = (key: ProviderKey) => {
    if (testingKeys.has(key.id)) {
      return 'Testing...';
    }

    if (key.lastTestStatus === 'success') {
      return 'Connected';
    } else if (key.lastTestStatus === 'failed') {
      return 'Failed';
    }

    return 'Not tested';
  };

  const getProviderInfo = (provider: string) => {
    return (
      PROVIDERS.find(p => p.value === provider) || {
        label: provider,
        description: '',
      }
    );
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="text-gray-600">Loading provider keys...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Provider Keys</h1>
          <p className="mt-2 text-gray-600">
            Manage your AI provider API keys for OpenAI, Anthropic, Google, and
            Perplexity
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Add Provider Key
        </Button>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">{error}</AlertDescription>
        </Alert>
      )}

      {/* Add Provider Key Form */}
      {showAddForm && (
        <Card>
          <CardHeader>
            <CardTitle>Add New Provider Key</CardTitle>
            <CardDescription>
              Add a new API key for one of the supported AI providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddProviderKey} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label htmlFor="provider">Provider</Label>
                  <Select
                    value={formData.provider}
                    onValueChange={value =>
                      setFormData(prev => ({ ...prev, provider: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROVIDERS.map(provider => (
                        <SelectItem key={provider.value} value={provider.value}>
                          <div>
                            <div className="font-medium">{provider.label}</div>
                            <div className="text-sm text-gray-500">
                              {provider.description}
                            </div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="model">Model (Optional)</Label>
                  <Input
                    id="model"
                    value={formData.model}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, model: e.target.value }))
                    }
                    placeholder="e.g., gpt-4, claude-3-sonnet"
                  />
                </div>

                <div>
                  <Label htmlFor="region">Region (Optional)</Label>
                  <Input
                    id="region"
                    value={formData.region}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, region: e.target.value }))
                    }
                    placeholder="e.g., us-east-1, eu-west-1"
                  />
                </div>

                <div>
                  <Label htmlFor="environment">Environment (Optional)</Label>
                  <Input
                    id="environment"
                    value={formData.environment}
                    onChange={e =>
                      setFormData(prev => ({
                        ...prev,
                        environment: e.target.value,
                      }))
                    }
                    placeholder="e.g., production, staging, development"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={formData.apiKey}
                  onChange={e =>
                    setFormData(prev => ({ ...prev, apiKey: e.target.value }))
                  }
                  placeholder="Enter your API key"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={e =>
                    setFormData(prev => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Describe this API key (e.g., 'Production OpenAI key for customer support')"
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={!formData.provider || !formData.apiKey}
                >
                  Add Provider Key
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Provider Keys List */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {providerKeys.map(key => {
          const providerInfo = getProviderInfo(key.provider);
          const testResult = testResults[key.id];

          return (
            <Card key={key.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Key className="h-5 w-5 text-blue-600" />
                    <CardTitle className="text-lg">
                      {providerInfo.label}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(key)}
                    <Badge variant={key.isActive ? 'default' : 'secondary'}>
                      {key.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
                <CardDescription>{providerInfo.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Status:</span>
                    <span
                      className={
                        key.lastTestStatus === 'success'
                          ? 'text-green-600'
                          : key.lastTestStatus === 'failed'
                            ? 'text-red-600'
                            : 'text-gray-600'
                      }
                    >
                      {getStatusText(key)}
                    </span>
                  </div>

                  {key.lastTestedAt && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Last tested:</span>
                      <span>
                        {new Date(key.lastTestedAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  {key.keyMetadata.model && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Model:</span>
                      <span>{key.keyMetadata.model}</span>
                    </div>
                  )}

                  {key.keyMetadata.region && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">Region:</span>
                      <span>{key.keyMetadata.region}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">API Key:</span>
                    <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs">
                      {key.encryptedKey}
                    </span>
                  </div>
                </div>

                {testResult && (
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="mb-2 text-sm font-medium">
                      Test Results:
                    </div>
                    {testResult.success ? (
                      <div className="space-y-1 text-sm">
                        <div className="flex items-center gap-2 text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          Connection successful
                        </div>
                        {testResult.latency && (
                          <div>Latency: {testResult.latency}ms</div>
                        )}
                        {testResult.models && testResult.models.length > 0 && (
                          <div>
                            Available models:{' '}
                            {testResult.models.slice(0, 3).join(', ')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-red-600">
                        <div className="flex items-center gap-2">
                          <XCircle className="h-4 w-4" />
                          Test failed
                        </div>
                        {testResult.error && (
                          <div className="mt-1 text-xs">{testResult.error}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {key.lastTestError && (
                  <div className="rounded-lg bg-red-50 p-3">
                    <div className="text-sm text-red-600">
                      <div className="font-medium">Last test error:</div>
                      <div className="mt-1 text-xs">{key.lastTestError}</div>
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleTestProviderKey(key.id)}
                    disabled={testingKeys.has(key.id)}
                    className="flex-1"
                  >
                    <TestTube className="mr-2 h-4 w-4" />
                    {testingKeys.has(key.id) ? 'Testing...' : 'Test'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDeleteProviderKey(key.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {providerKeys.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Key className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <h3 className="mb-2 text-lg font-medium text-gray-900">
              No provider keys configured
            </h3>
            <p className="mb-4 text-gray-600">
              Add your first provider key to start using AI models
            </p>
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Provider Key
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
