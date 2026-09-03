'use client';

import React, { useState, useEffect } from 'react';
import {
  EyeIcon,
  CalendarIcon,
  ArrowDownTrayIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ArrowUp,
  ArrowRight,
  ArrowDown,
} from 'lucide-react';
import { PageLayout } from '@/components/page-layout';
import { SelectDropdown } from '@/components/dropdown';
import { DateRangePicker } from '@/components/date-range-picker';
import { getApiUrl } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';

interface AuditLog {
  id: string;
  eventId: string;
  eventType: string;
  eventCategory: string;
  timestamp: string;
  actorEmail?: string;
  actorName?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  actorIpAddress?: string;
  status: string;
  description?: string;
  durationMs?: number;
  securityLevel?: string;
  metadata?: {
    phiDetected?: string[];
    [key: string]: any;
  };
  blockchainTxId?: string;
  blockchainVerified?: boolean;
}

export default function CompliancePage() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    if (token) {
      loadComplianceData(token);
    } else {
      setLoading(false);
    }
  }, [token]);

  const loadComplianceData = async (authToken: string) => {
    try {
      setLoading(true);

      if (!authToken) {
        console.error('Not authenticated');
        setLoading(false);
        return;
      }

      console.log('[Compliance] Fetching audit logs...');

      // Load audit logs from API
      try {
        const response = await fetch(
          `${getApiUrl()}/api/v1/audit-logs?limit=100`,
          {
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json',
            },
          }
        );

        console.log('[Compliance] Response status:', response.status);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data?.logs) {
            // Map API response to component format
            const mappedLogs = data.data.logs.map((log: any) => ({
              id: log.id,
              eventId: log.eventId,
              eventType: log.eventType,
              eventCategory: log.eventCategory,
              timestamp:
                log.timestamp instanceof Date
                  ? log.timestamp.toISOString()
                  : log.timestamp,
              actorEmail: log.actorEmail,
              actorName: log.actorName,
              action: log.action,
              resourceType: log.resourceType,
              resourceId: log.resourceId,
              actorIpAddress: log.actorIpAddress,
              status: log.status,
              description: log.description,
              durationMs: log.durationMs,
              securityLevel: log.securityLevel,
              metadata: log.metadata,
              blockchainTxId: log.blockchainTxId,
              blockchainVerified: log.blockchainVerified,
            }));
            setAuditLogs(mappedLogs);
          }
        } else {
          const errorText = await response.text();
          console.error(
            'Failed to load audit logs:',
            response.status,
            errorText
          );
        }
      } catch (error) {
        console.error('Failed to load audit logs:', error);
      }
    } catch (error) {
      console.error('Failed to load compliance data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Loading compliance data...
            </p>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-[95%] px-4 pb-6 pt-2 sm:px-6 lg:px-8 xl:max-w-[98%]">
        <AuditTab auditLogs={auditLogs} token={token} />
      </div>
    </PageLayout>
  );
}

// Audit Tab Component
function AuditTab({
  auditLogs,
  token,
}: {
  auditLogs: AuditLog[];
  token: string | null;
}) {
  const [filteredLogs, setFilteredLogs] = useState<AuditLog[]>(auditLogs);
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [category, setCategory] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [securityLevel, setSecurityLevel] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [blockchainPanelOpen, setBlockchainPanelOpen] = useState(false);
  const [selectedBlockchainTxId, setSelectedBlockchainTxId] = useState<
    string | null
  >(null);
  const [blockchainData, setBlockchainData] = useState<any>(null);
  const [blockchainLoading, setBlockchainLoading] = useState(false);

  // Update filtered logs when filters or original logs change
  useEffect(() => {
    setFilteredLogs(auditLogs);
  }, [auditLogs]);

  // Reset to first page when filters or page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [
    pageSize,
    searchTerm,
    category,
    status,
    securityLevel,
    startDate,
    endDate,
  ]);

  // Calculate pagination values
  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
  const totalCount = filteredLogs.length;

  // Apply filters
  const applyFilters = async () => {
    setLoading(true);
    try {
      if (!token) {
        console.error('Not authenticated');
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      params.append('limit', '100');

      if (category !== 'all') {
        params.append('category', category);
      }
      if (status !== 'all') {
        params.append('status', status);
      }
      if (securityLevel !== 'all') {
        params.append('securityLevel', securityLevel);
      }
      if (startDate) {
        params.append('startDate', startDate);
      }
      if (endDate) {
        params.append('endDate', endDate);
      }

      const response = await fetch(
        `${getApiUrl()}/api/v1/audit-logs?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.logs) {
          const mappedLogs = data.data.logs.map(
            (log: any): AuditLog => ({
              id: log.id,
              eventId: log.eventId,
              eventType: log.eventType,
              eventCategory: log.eventCategory,
              timestamp:
                log.timestamp instanceof Date
                  ? log.timestamp.toISOString()
                  : log.timestamp,
              actorEmail: log.actorEmail,
              actorName: log.actorName,
              action: log.action,
              resourceType: log.resourceType,
              resourceId: log.resourceId,
              actorIpAddress: log.actorIpAddress,
              status: log.status,
              description: log.description,
              durationMs: log.durationMs,
              securityLevel: log.securityLevel,
              metadata: log.metadata,
              blockchainTxId: log.blockchainTxId,
              blockchainVerified: log.blockchainVerified,
            })
          );

          // Apply local search filter if search term exists
          let filtered = mappedLogs;
          if (searchTerm.trim()) {
            const searchLower = searchTerm.toLowerCase();
            filtered = mappedLogs.filter(
              (log: AuditLog) =>
                log.eventType?.toLowerCase().includes(searchLower) ||
                log.eventCategory?.toLowerCase().includes(searchLower) ||
                log.actorEmail?.toLowerCase().includes(searchLower) ||
                log.actorName?.toLowerCase().includes(searchLower) ||
                log.description?.toLowerCase().includes(searchLower) ||
                log.action?.toLowerCase().includes(searchLower) ||
                log.resourceType?.toLowerCase().includes(searchLower)
            );
          }

          setFilteredLogs(filtered);
        }
      }
    } catch (error) {
      console.error('Error applying filters:', error);
    } finally {
      setLoading(false);
    }
  };

  // Debounced search
  useEffect(() => {
    if (
      searchTerm.trim() ||
      category !== 'all' ||
      status !== 'all' ||
      securityLevel !== 'all' ||
      startDate ||
      endDate
    ) {
      applyFilters();
    } else {
      setFilteredLogs(auditLogs);
    }
  }, [
    searchTerm,
    category,
    status,
    securityLevel,
    startDate,
    endDate,
    auditLogs,
    token,
  ]);

  const handleExport = async () => {
    if (!startDate || !endDate) {
      alert('Please select start and end dates for export');
      return;
    }

    try {
      setExporting(true);

      if (!token) {
        alert('Not authenticated');
        setExporting(false);
        return;
      }

      const params = new URLSearchParams();
      params.append('startDate', startDate);
      params.append('endDate', endDate);

      const response = await fetch(
        `${getApiUrl()}/api/v1/audit-logs/export?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit-logs-${startDate}-to-${endDate}.csv`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        const json = await response.json();
        alert(json.message || 'Failed to export audit logs');
      }
    } catch (err: any) {
      console.error('Error exporting audit logs:', err);
      alert('Failed to export audit logs');
    } finally {
      setExporting(false);
    }
  };

  const handleBlockchainView = async (txId: string) => {
    if (!txId) {
      alert('No blockchain transaction ID available');
      return;
    }

    try {
      setBlockchainLoading(true);
      setSelectedBlockchainTxId(txId);
      setBlockchainPanelOpen(true);

      if (!token) {
        alert('Not authenticated. Please log in again.');
        setBlockchainLoading(false);
        return;
      }

      if (token.trim() === '') {
        alert('Not authenticated. Please log in again.');
        setBlockchainLoading(false);
        return;
      }

      // Fetch blockchain transaction data with authentication
      const apiUrl = getApiUrl();
      const url = `${apiUrl}/api/v1/blockchain/audit/${txId}`;

      console.log(`[Blockchain] Fetching from: ${url}`);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        // Removed credentials: 'include' - not needed for token-based auth
        // Using credentials with wildcard CORS causes errors
      });

      console.log(`[Blockchain] Response status: ${response.status}`);

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setBlockchainData(data.data);
        } else {
          throw new Error(data.error || 'Failed to fetch blockchain data');
        }
      } else if (response.status === 401) {
        // Handle authentication error specifically
        const error = await response
          .json()
          .catch(() => ({ error: 'Unauthorized' }));
        alert(
          `Authentication failed.\n\n${error.error || 'Please log in again to view blockchain data.'}`
        );
        setBlockchainData(null);
      } else {
        const error = await response.json().catch(() => ({
          error: 'Failed to fetch blockchain data',
          details: '',
        }));
        const errorMessage = error.error || 'Failed to fetch blockchain data';
        const errorDetails = error.details || '';

        // Show more helpful error message
        if (response.status === 503) {
          alert(
            `Blockchain service is not available.\n\n${errorMessage}\n\n${errorDetails || 'Please ensure Hyperledger Fabric is running and configured.'}`
          );
        } else if (response.status === 404) {
          alert(
            `Blockchain record not found.\n\n${errorMessage}\n\nThis transaction may not have been recorded on the blockchain.`
          );
        } else {
          alert(
            `${errorMessage}\n\n${errorDetails || 'Please check blockchain configuration.'}`
          );
        }
        setBlockchainData(null);
      }
    } catch (err: any) {
      console.error('Error fetching blockchain data:', err);
      alert('Failed to fetch blockchain data');
      setBlockchainData(null);
    } finally {
      setBlockchainLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'bg-green-100 text-green-800';
      case 'failure':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'blocked':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusTextColor = (status: string): string => {
    switch (status) {
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'failure':
        return 'text-red-600 dark:text-red-400';
      case 'pending':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'blocked':
        return 'text-orange-600 dark:text-orange-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getSecurityBadgeColor = (level?: string): string => {
    switch (level) {
      case 'critical':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'normal':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'low':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  const getSecurityTextColor = (level?: string): string => {
    switch (level) {
      case 'critical':
        return 'text-red-600 dark:text-red-400';
      case 'high':
        return 'text-red-600 dark:text-red-400';
      case 'normal':
      case 'medium':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'low':
        return 'text-gray-600 dark:text-gray-400';
      default:
        return 'text-yellow-600 dark:text-yellow-400';
    }
  };

  const getSecurityIcon = (level?: string) => {
    const size = 16;
    switch (level) {
      case 'critical':
      case 'high':
        return <ArrowUp className="h-4 w-4 text-red-600 dark:text-red-400" />;
      case 'normal':
      case 'medium':
        return (
          <ArrowRight className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        );
      case 'low':
        return (
          <ArrowDown className="h-4 w-4 text-green-600 dark:text-green-400" />
        );
      default:
        return (
          <ArrowRight className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Audit Logs
        </h2>
        <div className="flex items-center space-x-4">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <button
            onClick={handleExport}
            disabled={!startDate || !endDate || exporting}
            style={{ backgroundColor: '#6820a9', color: '#ffffff' }}
            className="flex items-center rounded-md px-4 py-2 text-sm hover:opacity-90 disabled:cursor-not-allowed"
          >
            <ArrowDownTrayIcon className="mr-2 h-4 w-4" />
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>

      {/* Filters Section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm dark:border-[#242424] dark:bg-[#000000]">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
          {/* Search */}
          <div className="lg:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search logs..."
                className="w-full rounded-md border border-gray-300 bg-transparent py-2 pl-10 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-[#242424] dark:text-white"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Category
            </label>
            <SelectDropdown
              value={category}
              onChange={setCategory}
              options={[
                { value: 'all', label: 'All Categories' },
                { value: 'ai_interaction', label: 'AI Interactions' },
                { value: 'authentication', label: 'Authentication' },
                { value: 'authorization', label: 'Authorization' },
                { value: 'data_access', label: 'Data Access' },
                { value: 'configuration', label: 'Configuration' },
                { value: 'compliance', label: 'Compliance' },
              ]}
              className=""
              disableScroll={true}
            />
          </div>

          {/* Status */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Status
            </label>
            <SelectDropdown
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'success', label: 'Success' },
                { value: 'failure', label: 'Failure' },
                { value: 'pending', label: 'Pending' },
                { value: 'blocked', label: 'Blocked' },
              ]}
              className=""
            />
          </div>

          {/* Security Level */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Security Level
            </label>
            <SelectDropdown
              value={securityLevel}
              onChange={setSecurityLevel}
              options={[
                { value: 'all', label: 'All Levels' },
                { value: 'critical', label: 'Critical' },
                { value: 'high', label: 'High' },
                { value: 'normal', label: 'Normal' },
                { value: 'low', label: 'Low' },
              ]}
              className=""
            />
          </div>
        </div>

        {/* Clear Filters */}
        {(category !== 'all' ||
          status !== 'all' ||
          securityLevel !== 'all' ||
          searchTerm ||
          startDate ||
          endDate) && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => {
                setCategory('all');
                setStatus('all');
                setSecurityLevel('all');
                setSearchTerm('');
                setStartDate('');
                setEndDate('');
              }}
              className="text-sm text-white hover:text-gray-200"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-content p-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
                <p className="mt-4 text-gray-600 dark:text-gray-400">
                  Loading audit logs...
                </p>
              </div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center">
                <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
                <p className="mt-4 text-gray-600 dark:text-gray-400">
                  No audit logs found
                </p>
              </div>
            </div>
          ) : (
            <div className="max-h-[600px] overflow-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-[#242424]">
                <thead className="bg-gray-50 dark:bg-[#0d1117]">
                  <tr>
                    <th className="w-12 px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {/* Chevron column */}
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Timestamp
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Description
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      User
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Action
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      Security
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white dark:divide-[#242424] dark:bg-[#000000]">
                  {paginatedLogs.map(log => {
                    const isExpanded = expandedRowId === log.id;
                    const trimmedBlockchainTxId =
                      log.blockchainTxId && log.blockchainTxId.trim().length > 0
                        ? log.blockchainTxId.trim()
                        : null;
                    const fallbackResourceId =
                      typeof log.resourceId === 'string' &&
                      log.resourceId.trim().length > 0
                        ? log.resourceId.trim()
                        : null;
                    const ledgerLookupId = trimmedBlockchainTxId;
                    const ledgerDisplayText =
                      ledgerLookupId && ledgerLookupId.length > 20
                        ? `${ledgerLookupId.substring(0, 20)}...`
                        : ledgerLookupId || '';
                    return (
                      <React.Fragment key={log.id}>
                        <tr
                          className="cursor-pointer hover:bg-gray-50 dark:hover:bg-[#0d1117]"
                          onClick={() => {
                            setExpandedRowId(isExpanded ? null : log.id);
                          }}
                        >
                          <td className="px-4 py-3">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setExpandedRowId(isExpanded ? null : log.id);
                              }}
                              className="flex items-center justify-center"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                              )}
                            </button>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            {new Date(log.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                            {log.description || '-'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {log.actorEmail || log.actorName || 'System'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900 dark:text-white">
                            {log.action}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span
                              className={`text-xs font-medium capitalize ${getStatusTextColor(
                                log.status
                              )}`}
                            >
                              {log.status}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {getSecurityIcon(log.securityLevel)}
                          </td>
                        </tr>
                        {/* Expandable Details Row */}
                        {isExpanded && (
                          <tr key={`${log.id}-details`}>
                            <td
                              colSpan={7}
                              className="bg-gray-50 px-6 py-4 dark:bg-[#030303]"
                            >
                              <div className="flex gap-8 pl-16">
                                {/* Left Column - Main Content */}
                                <div className="flex-1 space-y-4">
                                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {/* Event Details */}
                                    <div>
                                      <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                                        Event Details
                                      </h4>
                                      <div className="space-y-1 text-sm">
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">
                                            Event ID:
                                          </span>{' '}
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {log.eventId}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">
                                            Event Type:
                                          </span>{' '}
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {log.eventType}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">
                                            Category:
                                          </span>{' '}
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {log.eventCategory}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Actor Details */}
                                    <div>
                                      <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                                        Actor Information
                                      </h4>
                                      <div className="space-y-1 text-sm">
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">
                                            Email:
                                          </span>{' '}
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {log.actorEmail || 'N/A'}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">
                                            Name:
                                          </span>{' '}
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {log.actorName || 'N/A'}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">
                                            IP Address:
                                          </span>{' '}
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {log.actorIpAddress || 'N/A'}
                                          </span>
                                        </div>
                                      </div>
                                    </div>

                                    {/* Resource Details */}
                                    <div>
                                      <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                                        Resource Information
                                      </h4>
                                      <div className="space-y-1 text-sm">
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">
                                            Type:
                                          </span>{' '}
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {log.resourceType}
                                          </span>
                                        </div>
                                        {log.resourceId && (
                                          <div>
                                            <span className="font-medium text-gray-700 dark:text-gray-300">
                                              ID:
                                            </span>{' '}
                                            <span className="font-mono text-xs text-gray-600 dark:text-gray-400">
                                              {log.resourceId}
                                            </span>
                                          </div>
                                        )}
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">
                                            Action:
                                          </span>{' '}
                                          <span className="text-gray-600 dark:text-gray-400">
                                            {log.action}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="font-medium text-gray-700 dark:text-gray-300">
                                            Blockchain Ledger:
                                          </span>{' '}
                                          {ledgerLookupId ? (
                                            <>
                                              <button
                                                onClick={e => {
                                                  e.stopPropagation();
                                                  handleBlockchainView(
                                                    ledgerLookupId
                                                  );
                                                }}
                                                className="font-mono text-xs text-purple-600 underline hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300"
                                                title="View blockchain transaction details"
                                              >
                                                {ledgerDisplayText}
                                              </button>
                                              <span
                                                className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                                  log.blockchainVerified
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                                                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200'
                                                }`}
                                              >
                                                {log.blockchainVerified
                                                  ? 'Verified'
                                                  : 'Unverified'}
                                              </span>
                                            </>
                                          ) : (
                                            <span className="text-gray-600 dark:text-gray-400">
                                              No blockchain transaction recorded
                                              yet
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Description */}
                                  {log.description && (
                                    <div>
                                      <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">
                                        Description
                                      </h4>
                                      <p className="text-sm text-gray-600 dark:text-gray-400">
                                        {log.description}
                                      </p>
                                    </div>
                                  )}
                                </div>

                                {/* Right Column - Performance Metrics */}
                                <div className="w-48 space-y-4">
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                      Duration:
                                    </h4>
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {log.durationMs
                                        ? `${log.durationMs}ms`
                                        : 'N/A'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                      Status:
                                    </h4>
                                    <span
                                      className={`text-sm capitalize ${getStatusTextColor(log.status)}`}
                                    >
                                      {log.status}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                      Security Level:
                                    </h4>
                                    {getSecurityIcon(log.securityLevel)}
                                  </div>
                                  {log.metadata?.phiDetected &&
                                    log.metadata.phiDetected.length > 0 && (
                                      <div className="flex items-center gap-2">
                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                          Identifiers:
                                        </h4>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                          HIPAA, PII (
                                          {log.metadata.phiDetected.length})
                                        </span>
                                      </div>
                                    )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Controls - Bottom */}
          {!loading && filteredLogs.length > 0 && (
            <div className="border-t border-gray-200 px-4 py-3 dark:border-[#242424]">
              <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Showing {startIndex + 1} to {Math.min(endIndex, totalCount)}{' '}
                    of {totalCount} results
                  </span>
                  <SelectDropdown
                    value={pageSize.toString()}
                    onChange={value => setPageSize(parseInt(value))}
                    options={[
                      { value: '25', label: '25 per page' },
                      { value: '50', label: '50 per page' },
                      { value: '75', label: '75 per page' },
                      { value: '100', label: '100 per page' },
                    ]}
                    className="w-32"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() =>
                      setCurrentPage(prev => Math.max(1, prev - 1))
                    }
                    disabled={currentPage === 1}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#242424] dark:bg-[#000000] dark:text-gray-300 dark:hover:bg-[#0d1117]"
                  >
                    Previous
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNumber;
                      if (totalPages <= 5) {
                        pageNumber = i + 1;
                      } else if (currentPage <= 3) {
                        pageNumber = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNumber = totalPages - 4 + i;
                      } else {
                        pageNumber = currentPage - 2 + i;
                      }

                      return (
                        <button
                          key={pageNumber}
                          onClick={() => setCurrentPage(pageNumber)}
                          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                            currentPage === pageNumber
                              ? 'bg-purple-600 text-white'
                              : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-[#242424] dark:bg-[#000000] dark:text-gray-300 dark:hover:bg-[#0d1117]'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() =>
                      setCurrentPage(prev => Math.min(totalPages, prev + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#242424] dark:bg-[#000000] dark:text-gray-300 dark:hover:bg-[#0d1117]"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Blockchain Side Panel */}
      {blockchainPanelOpen && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setBlockchainPanelOpen(false)}
          />

          {/* Panel */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-t border-gray-200 bg-[#000000] shadow-xl dark:border-[#242424]">
            <div className="sticky top-0 z-10 border-b border-gray-200 bg-[#000000] px-6 py-4 dark:border-[#242424]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🔒</span>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                    Blockchain Details
                  </h2>
                </div>
                <button
                  onClick={() => setBlockchainPanelOpen(false)}
                  className="rounded-md p-2 text-gray-500 dark:text-gray-400"
                >
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6">
              {blockchainLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <div className="text-center">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-purple-600"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">
                      Loading blockchain data...
                    </p>
                  </div>
                </div>
              ) : blockchainData ? (
                <div className="space-y-6">
                  {/* Transaction Metadata */}
                  <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
                    <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                      Transaction Metadata
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Request ID:
                        </span>
                        <span className="font-mono text-xs text-gray-900 dark:text-white">
                          {blockchainData.requestId}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Timestamp:
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {new Date(blockchainData.timestamp).toLocaleString()}
                        </span>
                      </div>
                      {blockchainData.sessionId && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Session ID:
                          </span>
                          <span className="font-mono text-xs text-gray-900 dark:text-white">
                            {blockchainData.sessionId}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Organization:
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {blockchainData.organization}
                        </span>
                      </div>
                      {blockchainData.chain && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Chain:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {blockchainData.chain}
                          </span>
                        </div>
                      )}
                      {blockchainData.block && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Block:
                          </span>
                          <span className="font-mono text-xs text-gray-900 dark:text-white">
                            {blockchainData.block}
                          </span>
                        </div>
                      )}
                      {blockchainData.recorded && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Recorded:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {new Date(blockchainData.recorded).toLocaleString()}
                          </span>
                        </div>
                      )}
                      {typeof blockchainData.confirmations !== 'undefined' && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Confirmations:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {blockchainData.confirmations}
                          </span>
                        </div>
                      )}
                      {blockchainData.status && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Status:
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-green-600 dark:text-green-400">
                              ✓ {blockchainData.status}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Hashes & Proofs */}
                  <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
                    <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                      Hashes & Proofs
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="break-all">
                        <span className="text-gray-600 dark:text-gray-400">
                          Input Hash:
                        </span>
                        <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                          {blockchainData.inputHash}
                        </div>
                      </div>
                      {blockchainData.sanitizedPromptHash && (
                        <div className="break-all">
                          <span className="text-gray-600 dark:text-gray-400">
                            Sanitized Prompt Hash:
                          </span>
                          <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                            {blockchainData.sanitizedPromptHash}
                          </div>
                        </div>
                      )}
                      {blockchainData.aiResponseHash && (
                        <div className="break-all">
                          <span className="text-gray-600 dark:text-gray-400">
                            AI Response Hash:
                          </span>
                          <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                            {blockchainData.aiResponseHash}
                          </div>
                        </div>
                      )}
                      {blockchainData.digitalSignature && (
                        <div className="break-all">
                          <span className="text-gray-600 dark:text-gray-400">
                            Digital Signature:
                          </span>
                          <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                            {blockchainData.digitalSignature}
                          </div>
                        </div>
                      )}
                      {blockchainData.merkleRoot && (
                        <div className="break-all">
                          <span className="text-gray-600 dark:text-gray-400">
                            Merkle Root:
                          </span>
                          <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                            {blockchainData.merkleRoot}
                          </div>
                        </div>
                      )}
                      {blockchainData.responseHash && (
                        <div className="break-all">
                          <span className="text-gray-600 dark:text-gray-400">
                            Response Hash:
                          </span>
                          <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                            {blockchainData.responseHash}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Usage Metrics */}
                  <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
                    <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                      Usage Metrics
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Tokens Used:
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {blockchainData.tokensUsed}
                        </span>
                      </div>
                      {blockchainData.tokensInput && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Tokens Input:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {blockchainData.tokensInput}
                          </span>
                        </div>
                      )}
                      {blockchainData.tokensOutput && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Tokens Output:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {blockchainData.tokensOutput}
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Cost USD:
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          ${blockchainData.costUsd?.toFixed(6)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Processing Time:
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {blockchainData.processingTimeMs}ms
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Cryptographic Verification */}
                  {(blockchainData.signature ||
                    blockchainData.signedBy ||
                    blockchainData.publicKey ||
                    blockchainData.verificationStatus) && (
                    <div className="rounded-lg border border-blue-200 p-4 dark:border-[#242424]">
                      <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                        Cryptographic Verification
                      </h3>
                      <div className="space-y-2 text-sm">
                        {blockchainData.signature && (
                          <div className="break-all">
                            <span className="text-gray-600 dark:text-gray-400">
                              Signature:
                            </span>
                            <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                              {blockchainData.signature}
                            </div>
                          </div>
                        )}
                        {blockchainData.signedBy && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Signed By:
                            </span>
                            <span className="text-gray-900 dark:text-white">
                              {blockchainData.signedBy}
                            </span>
                          </div>
                        )}
                        {blockchainData.publicKey && (
                          <div className="break-all">
                            <span className="text-gray-600 dark:text-gray-400">
                              Public Key:
                            </span>
                            <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                              {blockchainData.publicKey}
                            </div>
                          </div>
                        )}
                        {blockchainData.verificationStatus && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Verification Status:
                            </span>
                            <span
                              className={
                                blockchainData.verificationStatus === 'Valid'
                                  ? 'text-green-600 dark:text-green-400'
                                  : 'text-orange-600 dark:text-orange-400'
                              }
                            >
                              ✓ {blockchainData.verificationStatus}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Provider & Model Info */}
                  <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
                    <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                      Provider & Model
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          AI Provider:
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {blockchainData.aiProvider}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">
                          Model:
                        </span>
                        <span className="text-gray-900 dark:text-white">
                          {blockchainData.model}
                        </span>
                      </div>
                      {blockchainData.modelVersion && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">
                            Model Version:
                          </span>
                          <span className="text-gray-900 dark:text-white">
                            {blockchainData.modelVersion}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Compliance Data */}
                  {blockchainData.phiDetected &&
                    blockchainData.phiDetected.length > 0 && (
                      <div className="rounded-lg border border-red-200 p-4 dark:border-[#242424]">
                        <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                          PHI Detection
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {blockchainData.phiDetected.map(
                            (phi: string, idx: number) => (
                              <span
                                key={idx}
                                className="rounded-full border border-gray-300 px-2 py-0.5 text-xs text-gray-700 dark:border-[#242424] dark:text-gray-300"
                              >
                                {phi}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                  {/* Configuration */}
                  {(blockchainData.temperature ||
                    blockchainData.topP ||
                    blockchainData.systemPromptHash) && (
                    <div className="rounded-lg border border-gray-200 p-4 dark:border-[#242424]">
                      <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                        Configuration
                      </h3>
                      <div className="space-y-2 text-sm">
                        {blockchainData.temperature && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Temperature:
                            </span>
                            <span className="text-gray-900 dark:text-white">
                              {blockchainData.temperature}
                            </span>
                          </div>
                        )}
                        {blockchainData.topP && (
                          <div className="flex items-center justify-between">
                            <span className="text-gray-600 dark:text-gray-400">
                              Top P:
                            </span>
                            <span className="text-gray-900 dark:text-white">
                              {blockchainData.topP}
                            </span>
                          </div>
                        )}
                        {blockchainData.systemPromptHash && (
                          <div className="break-all">
                            <span className="text-gray-600 dark:text-gray-400">
                              System Prompt Hash:
                            </span>
                            <div className="mt-1 font-mono text-xs text-gray-900 dark:text-white">
                              {blockchainData.systemPromptHash}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* HIPAA Compliance */}
                  <div className="rounded-lg border border-green-200 p-4 dark:border-[#242424]">
                    <div className="flex items-center gap-2">
                      {blockchainData.hipaaCompliant ? (
                        <span className="text-xl">✓</span>
                      ) : (
                        <span className="text-xl">✗</span>
                      )}
                      <span className="text-sm font-semibold text-green-900 dark:text-green-400">
                        {blockchainData.hipaaCompliant
                          ? 'HIPAA Compliant'
                          : 'Non-Compliant'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex h-64 items-center justify-center">
                  <div className="max-w-md text-center">
                    <span className="text-4xl">🔒</span>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">
                      No blockchain data available
                    </p>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                      The blockchain service may not be connected or this
                      transaction may not have been recorded on the blockchain.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
