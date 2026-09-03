'use client';

import { useState, useEffect } from 'react';
import {
  CogIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  CpuChipIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  KeyIcon,
  UserCircleIcon,
  TrashIcon,
  PhoneIcon,
  AtSymbolIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { PageLayout } from '@/components/page-layout';
import { useAuth } from '@/contexts/AuthContext';

interface SystemConfig {
  deployment_mode: string;
  license_tier: string;
  monthly_budget: number;
  api: {
    port: number;
    rate_limit_max_requests: number;
    request_timeout_ms: number;
  };
  security: {
    password_min_length: number;
    two_factor_required: boolean;
    sso_enabled: boolean;
  };
  features: {
    sanitization: boolean;
    rag: boolean;
    model_comparison: boolean;
    smart_routing: boolean;
    local_llm: boolean;
    analytics: boolean;
    audit_logs: boolean;
  };
}

interface UserPreferences {
  ui: {
    theme: string;
    language: string;
    timezone: string;
  };
  ai: {
    default_model: string;
    optimization_strategy: string;
    budget_limit: number;
  };
  notifications: {
    email_notifications: boolean;
    notification_frequency: string;
  };
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [userPreferences, setUserPreferences] =
    useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);

      // Load system configuration
      const configResponse = await fetch('/api/v1/config/system');
      if (configResponse.ok) {
        const configData = await configResponse.json();
        setSystemConfig(configData.data.system_config);
      }

      // Load monthly budget
      const budgetResponse = await fetch('/api/v1/config/budget');
      if (budgetResponse.ok) {
        const budgetData = await budgetResponse.json();
        if (systemConfig) {
          setSystemConfig({
            ...systemConfig,
            monthly_budget: budgetData.data.monthly_budget,
          });
        }
      }

      // Load user preferences
      const prefsResponse = await fetch(
        '/api/v1/config/preferences?user_id=test-user-123'
      );
      if (prefsResponse.ok) {
        const prefsData = await prefsResponse.json();
        setUserPreferences(prefsData.data.preferences);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const saveSystemConfig = async (updates: Partial<SystemConfig>) => {
    try {
      setSaving(true);

      // Handle monthly budget separately
      if (updates.monthly_budget !== undefined) {
        const budgetResponse = await fetch('/api/v1/config/budget', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ monthly_budget: updates.monthly_budget }),
        });

        if (!budgetResponse.ok) {
          const error = await budgetResponse.json();
          setMessage({
            type: 'error',
            text: error.message || 'Failed to save monthly budget',
          });
          return;
        }
      }

      // Save other system configuration
      const { monthly_budget, ...otherUpdates } = updates;
      if (Object.keys(otherUpdates).length > 0) {
        const response = await fetch('/api/v1/config/system', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(otherUpdates),
        });

        if (!response.ok) {
          setMessage({
            type: 'error',
            text: 'Failed to update system configuration',
          });
          return;
        }
      }

      setMessage({
        type: 'success',
        text: 'Settings saved successfully',
      });
      loadSettings();
    } catch (error) {
      setMessage({
        type: 'error',
        text: 'Failed to save settings',
      });
    } finally {
      setSaving(false);
    }
  };

  const saveUserPreferences = async (updates: Partial<UserPreferences>) => {
    try {
      setSaving(true);
      const response = await fetch('/api/v1/config/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'test-user-123',
          organization_id: 'test-org-123',
          preferences: updates,
        }),
      });

      if (response.ok) {
        setMessage({
          type: 'success',
          text: 'User preferences updated successfully',
        });
        loadSettings();
      } else {
        setMessage({
          type: 'error',
          text: 'Failed to update user preferences',
        });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update user preferences' });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general', name: 'General', icon: UserGroupIcon },
    { id: 'system', name: 'System Configuration', icon: CogIcon },
    { id: 'security', name: 'Security Settings', icon: ShieldCheckIcon },
    { id: 'users', name: 'User Preferences', icon: UserGroupIcon },
    { id: 'ai', name: 'AI Configuration', icon: CpuChipIcon },
    { id: 'model-keys', name: 'API Keys', icon: KeyIcon },
  ];

  if (loading) {
    return (
      <PageLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Loading settings...
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="mx-auto max-w-6xl px-4 pb-6 pt-2 sm:px-6 lg:px-8">
        {/* Page Heading */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Account Settings
          </h1>
          <div className="mb-6 mt-6 border-t border-gray-200 dark:border-[#242424]"></div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mb-6 rounded-md p-4 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800'
                : message.type === 'error'
                  ? 'bg-red-50 text-red-800'
                  : 'bg-blue-50 text-blue-800'
            }`}
          >
            <div className="flex">
              {message.type === 'success' && (
                <CheckCircleIcon className="mr-2 h-5 w-5" />
              )}
              {message.type === 'error' && (
                <ExclamationTriangleIcon className="mr-2 h-5 w-5" />
              )}
              {message.type === 'info' && (
                <InformationCircleIcon className="mr-2 h-5 w-5" />
              )}
              {message.text}
            </div>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-12 lg:gap-x-8">
          {/* Sidebar */}
          <div className="lg:col-span-3">
            <nav className="space-y-1">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center rounded-md px-3 py-2 text-sm transition-colors ${
                      activeTab === tab.id
                        ? 'font-bold text-gray-900 dark:text-white'
                        : 'font-normal text-[#7b7b7b] hover:bg-gray-100 dark:hover:bg-[#0a0a0a]'
                    }`}
                  >
                    <Icon className="mr-3 h-5 w-5" />
                    {tab.name}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Main content */}
          <div className="lg:col-span-9">
            {activeTab === 'general' && <GeneralSettingsTab />}
            {activeTab === 'system' && (
              <SystemConfigTab
                config={systemConfig}
                onSave={saveSystemConfig}
                saving={saving}
              />
            )}
            {activeTab === 'security' && (
              <SecuritySettingsTab
                config={systemConfig}
                onSave={saveSystemConfig}
                saving={saving}
              />
            )}
            {activeTab === 'users' && (
              <UserPreferencesTab
                preferences={userPreferences}
                onSave={saveUserPreferences}
                saving={saving}
              />
            )}
            {activeTab === 'ai' && (
              <AIConfigTab
                config={systemConfig}
                onSave={saveSystemConfig}
                saving={saving}
              />
            )}
            {activeTab === 'model-keys' && <ModelApiKeysTab />}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

// General Settings Tab
function GeneralSettingsTab() {
  const { user, updateUser } = useAuth();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Local state for editing
  const [displayName, setDisplayName] = useState(
    user?.display_name || user?.name || ''
  );
  const [phone, setPhone] = useState(user?.phone || '');

  // Update local state when user changes
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || user.name || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAvatarFile(file);

      // Convert to base64 and save
      const reader = new FileReader();
      reader.onload = async event => {
        if (event.target?.result) {
          try {
            setSaving(true);
            setError(null);
            await updateUser({ avatar_url: event.target.result as string });
            setSuccess('Profile picture updated successfully!');
            setTimeout(() => setSuccess(null), 3000);
          } catch (err) {
            setError(
              err instanceof Error ? err.message : 'Failed to update avatar'
            );
          } finally {
            setSaving(false);
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      setSaving(true);
      setError(null);
      await updateUser({ avatar_url: null });
      setSuccess('Profile picture removed successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove avatar');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async (field: 'name' | 'phone', value: string) => {
    try {
      setSaving(true);
      setError(null);

      const updates: any = {};
      if (field === 'name') updates.display_name = value;
      if (field === 'phone') updates.phone = value;

      await updateUser(updates);
      setSuccess(
        `${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully!`
      );
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (
      confirm(
        'Are you sure you want to delete your account? This action cannot be undone.'
      )
    ) {
      // Handle account deletion
      console.log('Account deletion requested');
      // TODO: Implement actual account deletion
      setError('Account deletion is not yet implemented');
    }
  };

  return (
    <div className="space-y-6">
      {/* Success/Error Messages */}
      {success && (
        <div className="rounded-md bg-green-50 p-4 dark:bg-green-900/20">
          <p className="text-sm text-green-800 dark:text-green-200">
            {success}
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Avatar Card */}
      <div className="rounded-lg border border-gray-200 bg-transparent p-6 dark:border-[#242424]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Profile Picture
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Update your profile picture
            </p>
          </div>
        </div>
        <div className="mt-6 flex items-center space-x-6">
          <div className="relative">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt="Avatar"
                className="h-24 w-24 rounded-full object-cover"
              />
            ) : (
              <UserCircleIcon className="h-24 w-24 text-gray-400" />
            )}
          </div>
          <div className="flex-1">
            <label className="cursor-pointer rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 dark:border-[#242424] dark:text-gray-300 dark:hover:border-[#242424]">
              <input
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleAvatarChange}
                disabled={saving}
              />
              {saving ? 'Uploading...' : 'Upload Photo'}
            </label>
            {user?.avatar_url && (
              <button
                onClick={handleRemoveAvatar}
                disabled={saving}
                className="ml-3 rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 disabled:opacity-50 dark:border-[#242424] dark:text-gray-300 dark:hover:border-[#242424]"
              >
                Remove
              </button>
            )}
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              JPG, PNG or GIF. Max size 2MB.
            </p>
          </div>
        </div>
      </div>

      {/* Display Name Card */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-transparent dark:border-[#242424]">
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Display Name
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                This is how your name will appear across the platform
              </p>
            </div>
          </div>
          <div className="mt-6">
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-1/2 rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-[#242424] dark:text-white dark:focus:border-[#242424] dark:focus:ring-[#242424]"
              placeholder="Enter display name"
            />
          </div>
        </div>
        <div className="mt-6 border-t border-gray-200 dark:border-[#242424]"></div>
        <div className="bg-gray-50 px-6 pb-6 pt-4 dark:bg-[#0a0a0a]">
          <div className="flex justify-end">
            <button
              onClick={() => handleSaveProfile('name', displayName)}
              disabled={saving}
              className="rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 disabled:opacity-50 dark:border-[#242424] dark:text-gray-300 dark:hover:border-[#242424]"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Username Card (Read-only) */}
      <div className="rounded-lg border border-gray-200 bg-transparent p-6 dark:border-[#242424]">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Username
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Your login email address
            </p>
          </div>
          <AtSymbolIcon className="h-6 w-6 text-gray-400" />
        </div>
        <div className="mt-6">
          <div className="flex items-center space-x-3 rounded-md border border-gray-300 bg-transparent px-4 py-3 dark:border-[#242424]">
            <span className="text-gray-500 dark:text-gray-400">@</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {user?.email || 'Not set'}
            </span>
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            This is your account email and cannot be changed.
          </p>
        </div>
      </div>

      {/* Phone Number Card */}
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-transparent dark:border-[#242424]">
        <div className="px-6 pt-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Phone Number
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Update your contact phone number
              </p>
            </div>
            <PhoneIcon className="h-6 w-6 text-gray-400" />
          </div>
          <div className="mt-6">
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-1/2 rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-[#242424] dark:text-white dark:focus:border-[#242424] dark:focus:ring-[#242424]"
              placeholder="+1 (555) 123-4567"
            />
          </div>
        </div>
        <div className="mt-6 border-t border-gray-200 dark:border-[#242424]"></div>
        <div className="bg-gray-50 px-6 pb-6 pt-4 dark:bg-[#0a0a0a]">
          <div className="flex justify-end">
            <button
              onClick={() => handleSaveProfile('phone', phone)}
              disabled={saving}
              className="rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-400 disabled:opacity-50 dark:border-[#242424] dark:text-gray-300 dark:hover:border-[#242424]"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>

      {/* Delete Account Card */}
      <div className="rounded-lg border border-gray-200 bg-transparent p-6 dark:border-[#242424]">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
              Delete Account
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Permanently delete your account and all associated data
            </p>
          </div>
          <TrashIcon className="h-6 w-6 text-red-500" />
        </div>
        <div className="mt-6">
          <button
            onClick={handleDeleteAccount}
            className="rounded-md border border-red-600 bg-transparent px-6 py-2 text-sm font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:border-[#242424] dark:text-red-400 dark:hover:bg-red-900/20"
          >
            Delete Account
          </button>
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">
            Warning: This action cannot be undone. All your data will be
            permanently deleted.
          </p>
        </div>
      </div>
    </div>
  );
}

// System Configuration Tab
function SystemConfigTab({
  config,
  onSave,
  saving,
}: {
  config: SystemConfig | null;
  onSave: (updates: Partial<SystemConfig>) => void;
  saving: boolean;
}) {
  const [updates, setUpdates] = useState<Partial<SystemConfig>>({});

  const handleSave = () => {
    onSave(updates);
    setUpdates({});
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">System Configuration</h3>
          <p className="card-description">Configure core system settings</p>
        </div>
        <div className="card-content space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Deployment Mode
              </label>
              <select
                className="input mt-1"
                value={updates.deployment_mode || config.deployment_mode}
                onChange={e =>
                  setUpdates({ ...updates, deployment_mode: e.target.value })
                }
              >
                <option value="cloud">Cloud</option>
                <option value="hybrid">Hybrid</option>
                <option value="airgap">Air-gapped</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                License Tier
              </label>
              <select
                className="input mt-1"
                value={updates.license_tier || config.license_tier}
                onChange={e =>
                  setUpdates({ ...updates, license_tier: e.target.value })
                }
              >
                <option value="developer">Developer</option>
                <option value="team">Team</option>
                <option value="business">Business</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                API Port
              </label>
              <input
                type="number"
                className="input mt-1"
                value={updates.api?.port || config.api.port}
                onChange={e =>
                  setUpdates({
                    ...updates,
                    api: {
                      ...updates.api,
                      port: parseInt(e.target.value),
                      rate_limit_max_requests:
                        updates.api?.rate_limit_max_requests ||
                        config.api.rate_limit_max_requests,
                      request_timeout_ms:
                        updates.api?.request_timeout_ms ||
                        config.api.request_timeout_ms,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Rate Limit (requests)
              </label>
              <input
                type="number"
                className="input mt-1"
                value={
                  updates.api?.rate_limit_max_requests ||
                  config.api.rate_limit_max_requests
                }
                onChange={e =>
                  setUpdates({
                    ...updates,
                    api: {
                      ...updates.api,
                      rate_limit_max_requests: parseInt(e.target.value),
                      port: updates.api?.port || config.api.port,
                      request_timeout_ms:
                        updates.api?.request_timeout_ms ||
                        config.api.request_timeout_ms,
                    },
                  })
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Request Timeout (ms)
              </label>
              <input
                type="number"
                className="input mt-1"
                value={
                  updates.api?.request_timeout_ms ||
                  config.api.request_timeout_ms
                }
                onChange={e =>
                  setUpdates({
                    ...updates,
                    api: {
                      ...updates.api,
                      request_timeout_ms: parseInt(e.target.value),
                      port: updates.api?.port || config.api.port,
                      rate_limit_max_requests:
                        updates.api?.rate_limit_max_requests ||
                        config.api.rate_limit_max_requests,
                    },
                  })
                }
              />
            </div>
          </div>
        </div>
        <div className="card-footer">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Security Settings Tab
function SecuritySettingsTab({
  config,
  onSave,
  saving,
}: {
  config: SystemConfig | null;
  onSave: (updates: Partial<SystemConfig>) => void;
  saving: boolean;
}) {
  const [updates, setUpdates] = useState<Partial<SystemConfig>>({});

  const handleSave = () => {
    onSave(updates);
    setUpdates({});
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Security Settings</h3>
          <p className="card-description">
            Configure security and authentication settings
          </p>
        </div>
        <div className="card-content space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password Min Length
              </label>
              <input
                type="number"
                className="input mt-1"
                value={
                  updates.security?.password_min_length ||
                  config.security.password_min_length
                }
                onChange={e =>
                  setUpdates({
                    ...updates,
                    security: {
                      ...updates.security,
                      password_min_length: parseInt(e.target.value),
                      two_factor_required:
                        updates.security?.two_factor_required ??
                        config.security.two_factor_required,
                      sso_enabled:
                        updates.security?.sso_enabled ??
                        config.security.sso_enabled,
                    },
                  })
                }
              />
            </div>
            <div className="flex items-center space-x-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-[#242424]"
                  checked={
                    updates.security?.two_factor_required ??
                    config.security.two_factor_required
                  }
                  onChange={e =>
                    setUpdates({
                      ...updates,
                      security: {
                        ...updates.security,
                        two_factor_required: e.target.checked,
                        password_min_length:
                          updates.security?.password_min_length ??
                          config.security.password_min_length,
                        sso_enabled:
                          updates.security?.sso_enabled ??
                          config.security.sso_enabled,
                      },
                    })
                  }
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                  Require 2FA
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-[#242424]"
                checked={
                  updates.security?.sso_enabled ?? config.security.sso_enabled
                }
                onChange={e =>
                  setUpdates({
                    ...updates,
                    security: {
                      ...updates.security,
                      sso_enabled: e.target.checked,
                      password_min_length:
                        updates.security?.password_min_length ??
                        config.security.password_min_length,
                      two_factor_required:
                        updates.security?.two_factor_required ??
                        config.security.two_factor_required,
                    },
                  })
                }
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Enable SSO
              </span>
            </label>
          </div>
        </div>
        <div className="card-footer">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// User Preferences Tab
function UserPreferencesTab({
  preferences,
  onSave,
  saving,
}: {
  preferences: UserPreferences | null;
  onSave: (updates: Partial<UserPreferences>) => void;
  saving: boolean;
}) {
  const [updates, setUpdates] = useState<Partial<UserPreferences>>({});

  const handleSave = () => {
    onSave(updates);
    setUpdates({});
  };

  if (!preferences) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">User Preferences</h3>
          <p className="card-description">
            Configure user interface and notification preferences
          </p>
        </div>
        <div className="card-content space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Theme
              </label>
              <select
                className="input mt-1"
                value={updates.ui?.theme || preferences.ui.theme}
                onChange={e =>
                  setUpdates({
                    ...updates,
                    ui: {
                      ...updates.ui,
                      theme: e.target.value,
                      language: updates.ui?.language ?? preferences.ui.language,
                      timezone: updates.ui?.timezone ?? preferences.ui.timezone,
                    },
                  })
                }
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="auto">Auto</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Language
              </label>
              <select
                className="input mt-1"
                value={updates.ui?.language || preferences.ui.language}
                onChange={e =>
                  setUpdates({
                    ...updates,
                    ui: {
                      ...updates.ui,
                      language: e.target.value,
                      theme: updates.ui?.theme ?? preferences.ui.theme,
                      timezone: updates.ui?.timezone ?? preferences.ui.timezone,
                    },
                  })
                }
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Timezone
              </label>
              <select
                className="input mt-1"
                value={updates.ui?.timezone || preferences.ui.timezone}
                onChange={e =>
                  setUpdates({
                    ...updates,
                    ui: {
                      ...updates.ui,
                      timezone: e.target.value,
                      theme: updates.ui?.theme ?? preferences.ui.theme,
                      language: updates.ui?.language ?? preferences.ui.language,
                    },
                  })
                }
              >
                <option value="UTC">UTC</option>
                <option value="America/New_York">Eastern Time</option>
                <option value="America/Chicago">Central Time</option>
                <option value="America/Denver">Mountain Time</option>
                <option value="America/Los_Angeles">Pacific Time</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Default AI Model
              </label>
              <select
                className="input mt-1"
                value={
                  updates.ai?.default_model || preferences.ai.default_model
                }
                onChange={e =>
                  setUpdates({
                    ...updates,
                    ai: {
                      ...updates.ai,
                      default_model: e.target.value,
                      optimization_strategy:
                        updates.ai?.optimization_strategy ??
                        preferences.ai.optimization_strategy,
                      budget_limit:
                        updates.ai?.budget_limit ?? preferences.ai.budget_limit,
                    },
                  })
                }
              >
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                <option value="gpt-4">GPT-4</option>
                <option value="claude-3-haiku">Claude 3 Haiku</option>
                <option value="claude-3-sonnet">Claude 3 Sonnet</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Optimization Strategy
              </label>
              <select
                className="input mt-1"
                value={
                  updates.ai?.optimization_strategy ||
                  preferences.ai.optimization_strategy
                }
                onChange={e =>
                  setUpdates({
                    ...updates,
                    ai: {
                      ...updates.ai,
                      optimization_strategy: e.target.value,
                      default_model:
                        updates.ai?.default_model ??
                        preferences.ai.default_model,
                      budget_limit:
                        updates.ai?.budget_limit ?? preferences.ai.budget_limit,
                    },
                  })
                }
              >
                <option value="cost">Cost</option>
                <option value="speed">Speed</option>
                <option value="quality">Quality</option>
                <option value="balanced">Balanced</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-[#242424]"
                checked={
                  updates.notifications?.email_notifications ??
                  preferences.notifications.email_notifications
                }
                onChange={e =>
                  setUpdates({
                    ...updates,
                    notifications: {
                      ...updates.notifications,
                      email_notifications: e.target.checked,
                      notification_frequency:
                        updates.notifications?.notification_frequency ??
                        preferences.notifications.notification_frequency,
                    },
                  })
                }
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Email Notifications
              </span>
            </label>
          </div>
        </div>
        <div className="card-footer">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// AI Configuration Tab
function AIConfigTab({
  config,
  onSave,
  saving,
}: {
  config: SystemConfig | null;
  onSave: (updates: Partial<SystemConfig>) => void;
  saving: boolean;
}) {
  const [updates, setUpdates] = useState<Partial<SystemConfig>>({});

  const handleSave = () => {
    onSave(updates);
    setUpdates({});
  };

  if (!config) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      {/* AI Features */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">AI Features</h3>
          <p className="card-description">
            Enable or disable AI capabilities and features
          </p>
        </div>
        <div className="card-content">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Data Sanitization */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Data Sanitization
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Automatically detect and sanitize PII, PHI, and sensitive
                    data
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={
                      updates.features?.sanitization ??
                      config.features.sanitization
                    }
                    onChange={e =>
                      setUpdates({
                        ...updates,
                        features: {
                          ...updates.features,
                          sanitization: e.target.checked,
                          rag: updates.features?.rag ?? config.features.rag,
                          model_comparison:
                            updates.features?.model_comparison ??
                            config.features.model_comparison,
                          smart_routing:
                            updates.features?.smart_routing ??
                            config.features.smart_routing,
                          local_llm:
                            updates.features?.local_llm ??
                            config.features.local_llm,
                          analytics:
                            updates.features?.analytics ??
                            config.features.analytics,
                          audit_logs:
                            updates.features?.audit_logs ??
                            config.features.audit_logs,
                        },
                      })
                    }
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-purple-800"></div>
                </label>
              </div>
            </div>

            {/* RAG */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    RAG (Retrieval Augmented Generation)
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Enhance responses with context from your knowledge base
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={updates.features?.rag ?? config.features.rag}
                    onChange={e =>
                      setUpdates({
                        ...updates,
                        features: {
                          ...config.features,
                          ...(updates.features || {}),
                          rag: e.target.checked,
                        },
                      })
                    }
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-purple-800"></div>
                </label>
              </div>
            </div>

            {/* Model Comparison */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Model Comparison
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Compare performance across different AI models
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={
                      updates.features?.model_comparison ??
                      config.features.model_comparison
                    }
                    onChange={e =>
                      setUpdates({
                        ...updates,
                        features: {
                          ...config.features,
                          ...(updates.features || {}),
                          model_comparison: e.target.checked,
                        },
                      })
                    }
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-purple-800"></div>
                </label>
              </div>
            </div>

            {/* Smart Routing */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Smart Routing
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Automatically select the best model for each request
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={
                      updates.features?.smart_routing ??
                      config.features.smart_routing
                    }
                    onChange={e =>
                      setUpdates({
                        ...updates,
                        features: {
                          ...config.features,
                          ...(updates.features || {}),
                          smart_routing: e.target.checked,
                        },
                      })
                    }
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-purple-800"></div>
                </label>
              </div>
            </div>

            {/* Local LLM */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Local LLM
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Run AI models locally for enhanced privacy
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={
                      updates.features?.local_llm ?? config.features.local_llm
                    }
                    onChange={e =>
                      setUpdates({
                        ...updates,
                        features: {
                          ...config.features,
                          ...(updates.features || {}),
                          local_llm: e.target.checked,
                        },
                      })
                    }
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-purple-800"></div>
                </label>
              </div>
            </div>

            {/* Analytics */}
            <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                    Analytics
                  </h4>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Track usage patterns and performance metrics
                  </p>
                </div>
                <label className="relative inline-flex cursor-pointer items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={
                      updates.features?.analytics ?? config.features.analytics
                    }
                    onChange={e =>
                      setUpdates({
                        ...updates,
                        features: {
                          ...config.features,
                          ...(updates.features || {}),
                          analytics: e.target.checked,
                        },
                      })
                    }
                  />
                  <div className="peer h-6 w-11 rounded-full bg-gray-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-purple-600 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:ring-4 peer-focus:ring-purple-300 dark:border-gray-600 dark:bg-gray-700 dark:peer-focus:ring-purple-800"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Configuration */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Budget Configuration</h3>
          <p className="card-description">
            Set spending limits and budget controls for AI usage
          </p>
        </div>
        <div className="card-content">
          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Monthly Budget (USD)
            </label>
            <div className="mt-2">
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <span className="text-gray-500 sm:text-sm dark:text-gray-400">
                    $
                  </span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  className="block w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-7 pr-3 text-sm text-gray-900 shadow-sm transition-colors focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-200 dark:border-[#242424] dark:bg-[#000000] dark:text-white dark:focus:border-purple-400 dark:focus:ring-purple-800"
                  value={
                    updates.monthly_budget !== undefined
                      ? updates.monthly_budget
                      : config.monthly_budget || ''
                  }
                  onChange={e =>
                    setUpdates({
                      ...updates,
                      monthly_budget: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              Set a monthly budget limit for AI usage. Leave empty for no limit.
            </p>
          </div>
        </div>
        <div className="card-footer">
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center rounded-md border border-[#242424] bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 dark:text-white dark:hover:bg-gray-800"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Node2AI API Keys Tab
function Node2AIApiKeysTab() {
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    // Mock data - will connect to native settings API once available
    const mockApiKeys = [
      {
        id: '1',
        name: 'Production API Key',
        key: 'sk-node2-1234567890abcdef',
        scopes: ['read', 'write'],
        rate_limit: 1000,
        last_used_at: '2024-01-21T10:30:00Z',
      },
    ];
    setApiKeys(mockApiKeys);
    setLoading(false);
  }, []);

  if (loading) return <div className="py-8 text-center">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="card-title">Node2AI API Keys</h3>
              <p className="card-description">
                Manage API keys for accessing your Node2AI platform
              </p>
            </div>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="btn-primary"
            >
              {showAddForm ? 'Cancel' : 'Add API Key'}
            </button>
          </div>
        </div>
        <div className="card-content">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Key
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Scopes
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Rate Limit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Last Used
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
                {apiKeys.map(key => (
                  <tr key={key.id}>
                    <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {key.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      <code className="rounded bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-gray-800">
                        {key.key.substring(0, 20)}...
                      </code>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {key.scopes.map((scope: string) => (
                          <span
                            key={scope}
                            className="inline-flex rounded-full bg-blue-100 px-2 text-xs font-semibold leading-5 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {key.rate_limit}/min
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {key.last_used_at
                        ? new Date(key.last_used_at).toLocaleDateString()
                        : 'Never'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Model API Keys Tab
function ModelApiKeysTab() {
  const { user, token } = useAuth();
  const [providerKeys, setProviderKeys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [testingKeys, setTestingKeys] = useState<Set<string>>(new Set());
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [formData, setFormData] = useState({
    provider: '',
    apiKey: '',
    environment: 'production',
    description: '',
  });
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);

  const PROVIDERS = [
    {
      value: 'openai',
      label: 'OpenAI',
      description: 'GPT-4, GPT-3.5, DALL-E',
      icon: '🤖',
    },
    {
      value: 'anthropic',
      label: 'Anthropic',
      description: 'Claude-3, Claude-2',
      icon: '🧠',
    },
    {
      value: 'google',
      label: 'Google',
      description: 'Gemini Pro, PaLM',
      icon: '🔍',
    },
    {
      value: 'perplexity',
      label: 'Perplexity',
      description: 'Perplexity AI',
      icon: '🌐',
    },
  ];

  useEffect(() => {
    if (token) {
      loadProviderKeys();
    }
  }, [token]);

  // Reset verification when key form data changes
  useEffect(() => {
    if (verified) {
      setVerified(false);
      setVerificationResult(null);
    }
  }, [formData.provider, formData.apiKey]);

  const getAuthHeaders = () => {
    if (!token) {
      throw new Error('Authentication required. Please log in again.');
    }

    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const loadProviderKeys = async () => {
    try {
      setLoading(true);
      setError(null);
      const headers = getAuthHeaders();
      const response = await fetch('/api/v1/provider-keys', { headers });
      if (response.ok) {
        const data = await response.json();
        setProviderKeys(data.data.provider_keys || []);
      } else {
        throw new Error('Failed to load provider keys');
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to load provider keys'
      );
    } finally {
      setLoading(false);
    }
  };

  const [tempKeyId, setTempKeyId] = useState<string | null>(null);

  const handleVerifyKey = async () => {
    console.log('handleVerifyKey called', { formData });
    setError(null);
    setVerifying(true);
    setVerificationResult(null);

    try {
      const headers = getAuthHeaders();
      console.log('Calling POST /api/v1/provider-keys', { formData });

      // Create a temporary key to test
      const response = await fetch('/api/v1/provider-keys', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          provider: formData.provider,
          apiKey: formData.apiKey,
          environment: formData.environment || 'production',
          keyMetadata: {
            description: formData.description || undefined,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to verify provider key');
      }

      const data = await response.json();
      console.log('Provider key created:', data);
      const newTempKeyId = data.data.provider_key.id;
      setTempKeyId(newTempKeyId);

      // Test the key
      const testResponse = await fetch(
        `/api/v1/provider-keys/${newTempKeyId}/test`,
        {
          method: 'POST',
          headers,
        }
      );

      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        console.error('Test failed:', errorText);
        // Delete the failed key
        await fetch(`/api/v1/provider-keys/${newTempKeyId}`, {
          method: 'DELETE',
          headers,
        });
        setTempKeyId(null);
        throw new Error(
          'Failed to verify API key. Please check the key is valid.'
        );
      }

      const testData = await testResponse.json();
      console.log('Test response:', testData);

      if (!testData.data || !testData.data.test_result) {
        console.error('Invalid test response:', testData);
        // Delete the failed key
        await fetch(`/api/v1/provider-keys/${newTempKeyId}`, {
          method: 'DELETE',
          headers,
        });
        setTempKeyId(null);
        throw new Error('Invalid response from verification service');
      }

      if (testData.data.test_result.success) {
        console.log('Verification successful!');
        setVerificationResult(testData.data.test_result);
        setVerified(true);
        setSuccess('API key verified successfully');
      } else {
        console.log('Verification failed:', testData.data.test_result);
        // Delete the failed key
        await fetch(`/api/v1/provider-keys/${newTempKeyId}`, {
          method: 'DELETE',
          headers,
        });
        setTempKeyId(null);
        throw new Error(
          testData.data.test_result.error || 'Verification failed'
        );
      }
    } catch (err) {
      console.error('Verification error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to verify provider key'
      );
      setVerified(false);
      setTempKeyId(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleAddProviderKey = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!verified) {
      await handleVerifyKey();
      return;
    }

    // If already verified, the key was already saved during verification
    // Just close the dialog and reload keys
    setSuccess('Provider key saved successfully!');
    setFormData({
      provider: '',
      apiKey: '',
      environment: 'production',
      description: '',
    });
    setVerified(false);
    setVerificationResult(null);
    setTempKeyId(null);
    setShowAddForm(false);
    await loadProviderKeys();
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleTestProviderKey = async (keyId: string) => {
    setError(null);
    try {
      setTestingKeys(prev => new Set(prev).add(keyId));
      const headers = await getAuthHeaders();
      const response = await fetch(`/api/v1/provider-keys/${keyId}/test`, {
        method: 'POST',
        headers,
      });
      const data = await response.json();
      setTestResults(prev => ({ ...prev, [keyId]: data.data.test_result }));
      await loadProviderKeys();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to test provider key'
      );
    } finally {
      setTestingKeys(prev => {
        const newSet = new Set(prev);
        newSet.delete(keyId);
        return newSet;
      });
    }
  };

  const handleEditProviderKey = async (keyId: string) => {
    setEditingKey(null);
    // TODO: Open edit dialog or navigate to edit page
    console.log('Edit key:', keyId);
    // For now, just show an alert
    alert('Edit functionality coming soon');
  };

  const handleDeleteProviderKey = (keyId: string) => {
    setKeyToDelete(keyId);
    setDeleteConfirmOpen(true);
    setDeleteConfirmText('');
  };

  const confirmDelete = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete') {
      setError('Please type "DELETE" to confirm');
      return;
    }

    if (!keyToDelete) {
      setError('No key selected for deletion');
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const headers = await getAuthHeaders();
      console.log(
        'Sending DELETE request to:',
        `/api/v1/provider-keys/${keyToDelete}`
      );
      const response = await fetch(`/api/v1/provider-keys/${keyToDelete}`, {
        method: 'DELETE',
        headers,
      });

      console.log('Delete response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.log('Delete failed:', errorText);
        throw new Error('Failed to delete provider key');
      }

      setSuccess('Provider key deleted successfully!');
      setDeleteConfirmOpen(false);
      setDeleteConfirmText('');
      setKeyToDelete(null);
      await loadProviderKeys();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Delete error:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to delete provider key'
      );
    }
  };

  const getProviderInfo = (provider: string) =>
    PROVIDERS.find(p => p.value === provider) || {
      label: provider,
      description: '',
      icon: '🔑',
    };

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading provider keys...
          </p>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Error Message */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="rounded-md bg-green-50 p-4 dark:bg-green-900/20">
          <p className="text-sm text-green-800 dark:text-green-200">
            {success}
          </p>
        </div>
      )}

      {/* Node2AI API Keys Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Node2AI API Keys
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage API keys for accessing your Node2AI platform
            </p>
          </div>
          <button className="rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800">
            + Add Node2AI Key
          </button>
        </div>
        <div className="rounded-lg border border-gray-200 bg-transparent p-12 text-center dark:border-[#242424]">
          <KeyIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No Node2AI API keys configured
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add your first Node2AI API key to get started
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="my-8 border-t border-gray-200 dark:border-[#242424]"></div>

      {/* Add Provider Key Dialog */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black bg-opacity-50">
          <div className="relative w-full max-w-2xl rounded-lg border border-gray-200 bg-white p-6 shadow-xl dark:border-[#242424] dark:bg-[#000000]">
            {/* Dialog Header */}
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                Add Provider Key
              </h3>
              <button
                onClick={() => setShowAddForm(false)}
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Dialog Content */}
            <form onSubmit={handleAddProviderKey} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Provider <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-[#242424] dark:text-white"
                    value={formData.provider}
                    onChange={e =>
                      setFormData({ ...formData, provider: e.target.value })
                    }
                    required
                  >
                    <option value="">Select provider</option>
                    {PROVIDERS.map(p => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Environment
                  </label>
                  <select
                    className="mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-[#242424] dark:text-white"
                    value={formData.environment}
                    onChange={e =>
                      setFormData({ ...formData, environment: e.target.value })
                    }
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  API Key <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  className="mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-[#242424] dark:text-white dark:placeholder:text-[#242424]"
                  value={formData.apiKey}
                  onChange={e =>
                    setFormData({ ...formData, apiKey: e.target.value })
                  }
                  placeholder="sk-..."
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Your API key will be encrypted before storage
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Description (Optional)
                </label>
                <textarea
                  className="mt-1 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 focus:outline-none dark:border-[#242424] dark:text-white dark:placeholder:text-[#242424]"
                  rows={2}
                  value={formData.description}
                  onChange={e =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  placeholder="Add notes about this API key..."
                />
              </div>

              {/* Verification Result */}
              {verificationResult && verified && (
                <div className="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center text-green-700 dark:text-green-300">
                      <CheckCircleIcon className="mr-2 h-5 w-5" />
                      <span className="font-medium">
                        Connection verified successfully!
                      </span>
                    </div>
                    {verificationResult.latency && (
                      <div className="text-xs text-green-600 dark:text-green-400">
                        Latency: {verificationResult.latency}ms
                      </div>
                    )}
                    {verificationResult.models &&
                      verificationResult.models.length > 0 && (
                        <div className="text-xs text-green-600 dark:text-green-400">
                          Available models:{' '}
                          {verificationResult.models.slice(0, 3).join(', ')}
                          {verificationResult.models.length > 3 &&
                            ` +${verificationResult.models.length - 3} more`}
                        </div>
                      )}
                    {verificationResult.capabilities && (
                      <div className="flex flex-wrap gap-1">
                        {verificationResult.capabilities.functionCalling && (
                          <span className="rounded bg-green-200 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-300">
                            Functions
                          </span>
                        )}
                        {verificationResult.capabilities.vision && (
                          <span className="rounded bg-green-200 px-1.5 py-0.5 text-xs text-green-800 dark:bg-green-900/40 dark:text-green-300">
                            Vision
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-4">
                <button
                  type="button"
                  onClick={async () => {
                    // If there's a temporary verified key, delete it
                    if (tempKeyId && verified) {
                      try {
                        const headers = await getAuthHeaders();
                        await fetch(`/api/v1/provider-keys/${tempKeyId}`, {
                          method: 'DELETE',
                          headers,
                        });
                      } catch (err) {
                        console.error('Failed to delete temporary key:', err);
                      }
                    }

                    setShowAddForm(false);
                    setVerified(false);
                    setVerificationResult(null);
                    setTempKeyId(null);
                    setFormData({
                      provider: '',
                      apiKey: '',
                      environment: 'production',
                      description: '',
                    });
                  }}
                  className="rounded-md border border-gray-300 bg-transparent px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-gray-300 dark:hover:bg-gray-800"
                  disabled={verifying}
                >
                  Cancel
                </button>
                {!verified && (
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800"
                    disabled={verifying}
                  >
                    {verifying ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-900 border-t-transparent dark:border-white dark:border-t-transparent"></div>
                        Verifying...
                      </>
                    ) : (
                      'Verify'
                    )}
                  </button>
                )}
                {verified && (
                  <button
                    type="button"
                    onClick={async e => {
                      await handleAddProviderKey(e as any);
                    }}
                    className="flex items-center gap-2 rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800"
                  >
                    Save
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header with Title and Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Provider API Keys
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage API keys for OpenAI, Anthropic, Google, and other AI
            providers
          </p>
        </div>
        {providerKeys.length > 0 && (
          <button
            onClick={() => {
              setShowAddForm(true);
              setVerified(false);
              setVerificationResult(null);
            }}
            className="rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800"
            title="Add Provider Key"
          >
            + Add Provider Key
          </button>
        )}
      </div>

      {providerKeys.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-transparent p-12 text-center dark:border-[#242424]">
          <CpuChipIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No provider keys configured
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Add your first AI provider API key to get started
          </p>
          <button
            onClick={() => {
              setShowAddForm(true);
              setVerified(false);
              setVerificationResult(null);
            }}
            className="mt-4 rounded-md border border-gray-300 bg-transparent px-6 py-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-white dark:hover:bg-gray-800"
          >
            + Add Provider Key
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {providerKeys.map((key, index) => {
            const providerInfo = getProviderInfo(key.provider);
            const testResult = testResults[key.id];
            const isTesting = testingKeys.has(key.id);
            const isActive = key.isActive !== false;
            return (
              <div
                key={key.id}
                className={`rounded-lg border border-gray-200 bg-transparent p-6 dark:border-[#242424] ${
                  !isActive && 'opacity-60'
                }`}
              >
                {/* Header with Status Dot, Provider Name, and Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Status Dot - Active = Green, Inactive = Red */}
                    <div
                      className={`h-3 w-3 rounded-full ${
                        isActive ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      {providerInfo.label}
                    </h3>
                  </div>

                  {/* Right Section: Actions */}
                  <div className="flex items-center gap-3">
                    {/* Environment Badge */}
                    {key.environment && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                        {key.environment}
                      </span>
                    )}

                    {/* Active Toggle */}
                    <button
                      onClick={async () => {
                        try {
                          setError(null);
                          const headers = await getAuthHeaders();
                          const response = await fetch(
                            `/api/v1/provider-keys/${key.id}`,
                            {
                              method: 'PUT',
                              headers,
                              body: JSON.stringify({
                                isActive: !isActive,
                              }),
                            }
                          );

                          if (!response.ok) {
                            throw new Error('Failed to update provider key');
                          }

                          await loadProviderKeys();
                        } catch (err) {
                          setError(
                            err instanceof Error
                              ? err.message
                              : 'Failed to toggle provider key'
                          );
                        }
                      }}
                      className={`relative inline-flex h-4 w-8 items-center rounded-full px-0.5 transition-colors ${
                        isActive ? 'bg-[#671eab]' : 'bg-[#242424]'
                      }`}
                    >
                      <span
                        className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform ${
                          isActive ? 'translate-x-3.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    {/* Three-dot Menu */}
                    <div className="relative">
                      <button
                        className="p-2 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                        onClick={() =>
                          setEditingKey(editingKey === key.id ? null : key.id)
                        }
                      >
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M10 10a2 2 0 100-4 2 2 0 000 4zM3 10a2 2 0 100-4 2 2 0 000 4zM17 10a2 2 0 100-4 2 2 0 000 4z" />
                        </svg>
                      </button>

                      {editingKey === key.id && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setEditingKey(null)}
                          />
                          <div className="absolute right-0 top-10 z-20 w-40 rounded-md border border-gray-200 bg-white shadow-lg dark:border-[#242424] dark:bg-[#000000]">
                            <button
                              onClick={() => {
                                handleTestProviderKey(key.id);
                                setEditingKey(null);
                              }}
                              disabled={isTesting || !isActive}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              {isTesting ? 'Testing...' : 'Test Connection'}
                            </button>
                            <button
                              onClick={() => {
                                handleEditProviderKey(key.id);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => {
                                handleDeleteProviderKey(key.id);
                                setEditingKey(null);
                              }}
                              disabled={isTesting}
                              className="w-full px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* API Key Display */}
                <div className="mt-6">
                  <div className="flex items-center space-x-3 rounded-md border border-gray-300 bg-transparent px-4 py-3 dark:border-[#242424]">
                    <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                      {(() => {
                        // Show masked version with provider prefix
                        const maskedKey = key.encryptedKey || '';

                        if (maskedKey && maskedKey.length >= 6) {
                          const prefix =
                            key.provider === 'openai'
                              ? 'sk-'
                              : key.provider === 'anthropic'
                                ? 'sk-ant-'
                                : key.provider === 'google'
                                  ? 'AIza'
                                  : key.provider === 'perplexity'
                                    ? 'pplx-'
                                    : 'key-';

                          // The API returns encryptedKey as first 20 chars + '...'
                          // So we need to extract the actual characters
                          let actualKey = maskedKey;
                          if (maskedKey.endsWith('...')) {
                            actualKey = maskedKey.substring(
                              0,
                              maskedKey.length - 3
                            );
                          }

                          if (actualKey.length >= 6) {
                            const first3 = actualKey.substring(0, 3);
                            const last3 = actualKey.substring(
                              actualKey.length - 3
                            );
                            return `${prefix}${first3}...${last3}`;
                          }
                        }
                        return 'key-••••••••';
                      })()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Encrypted provider API key
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg border border-gray-300 bg-white p-6 dark:border-[#242424] dark:bg-[#0a0a0a]">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              Confirm Delete
            </h3>
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              Are you sure you want to delete this provider key? This action
              cannot be undone.
            </p>
            <p className="mb-4 text-sm font-medium text-gray-700 dark:text-gray-300">
              Type{' '}
              <span className="font-mono text-red-600 dark:text-red-400">
                DELETE
              </span>{' '}
              to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE here"
              className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none dark:border-[#242424] dark:text-white dark:placeholder:text-gray-500"
            />
            {error && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  setDeleteConfirmText('');
                  setKeyToDelete(null);
                  setError(null);
                }}
                className="rounded-md border border-gray-300 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteConfirmText.toLowerCase() !== 'delete'}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
