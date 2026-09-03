'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageLayout } from '@/components/page-layout';
import { useAuth } from '@/contexts/AuthContext';
import { InformationCircleIcon } from '@heroicons/react/24/outline';

interface SanitizationTest {
  prompt: string;
  sanitizedPrompt?: string;
  response: string;
  sanitized: string;
  desanitized?: string;
  model?: string;
  metadata: any;
  error?: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
  role: string;
  organization_id: string;
}

export default function TestSanitizationPage() {
  const { user: currentUser, token } = useAuth(); // Current logged-in user (admin like John Adams)
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SanitizationTest | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [loadingApiKey, setLoadingApiKey] = useState(true);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Employee/user selection for tracking usage
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
    null
  );
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [employeeError, setEmployeeError] = useState<string | null>(null);

  const loadApiKey = useCallback(async () => {
    // Log current user details for debugging
    console.log('🔑 loadApiKey called:', {
      hasUser: !!currentUser,
      userId: currentUser?.id,
      userEmail: currentUser?.email,
      organizationId:
        currentUser?.organization_id || (currentUser as any)?.organizationId,
      fullUser: currentUser,
    });

    if (!currentUser) {
      console.warn('No current user available, cannot load License Key');
      setApiKeyError('Please log in to access this feature.');
      setLoadingApiKey(false);
      return;
    }

    // Handle all-zeros organization_id (treat as missing)
    const userOrgId =
      currentUser.organization_id ||
      (currentUser as any).organizationId ||
      null;
    const orgId =
      userOrgId && userOrgId !== '00000000-0000-0000-0000-000000000000'
        ? userOrgId
        : '00000000-0000-0000-0000-000000000001'; // Use default if missing or all zeros

    if (!orgId || orgId === '00000000-0000-0000-0000-000000000000') {
      console.warn('User does not have valid organizationId:', {
        userId: currentUser.id,
        email: currentUser.email,
        organizationId:
          currentUser.organization_id || (currentUser as any).organizationId,
        userObject: currentUser,
      });
      setApiKeyError(
        'Your account is not associated with an organization. Please contact your administrator to assign you to an organization, or check your user profile settings.'
      );
      setLoadingApiKey(false);
      return;
    }

    // Use the valid organization ID (either from user or default)
    const validOrganizationId = orgId;

    try {
      setLoadingApiKey(true);
      setApiKeyError(null);

      if (!token) {
        setApiKeyError('Authentication required. Please log in again.');
        setLoadingApiKey(false);
        return;
      }

      // Fetch License Keys for this organization from database
      const response = await fetch(
        `/api/v1/api-keys?organization_id=${validOrganizationId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          'Failed to load License Keys:',
          response.status,
          errorText
        );
        throw new Error(`Failed to load License Keys: ${response.status}`);
      }

      const result = await response.json();
      console.log('🔑 License Keys response:', {
        success: result.success,
        hasData: !!result.data,
        licenseKeysCount: result.data?.api_keys?.length || 0,
        licenseKeys: result.data?.api_keys,
        statistics: result.data?.statistics,
        fullResponse: result,
      });

      if (
        result.success &&
        result.data?.api_keys &&
        result.data.api_keys.length > 0
      ) {
        // Find an active License Key
        const activeKey = result.data.api_keys.find(
          (key: any) => key.is_active
        );

        if (activeKey) {
          // Store the License Key ID (we can't retrieve the actual key for security reasons)
          // The backend will accept Bearer token authentication for simulation
          setApiKey(activeKey.id);
          console.log(
            '✓ License Key configured:',
            activeKey.id,
            activeKey.name
          );
          setApiKeyError(null);
        } else {
          // All keys are inactive
          const errorMsg = `Found ${result.data.api_keys.length} License Key(s) but none are active. Please activate a License Key in Settings > License Keys, or create a new one.`;
          setApiKeyError(errorMsg);
          console.warn(
            'No active License Key found. Total keys:',
            result.data.api_keys.length
          );
        }
      } else {
        // No License Keys at all
        const errorMsg =
          'No License Keys configured for your organization. Please create a License Key in Settings > License Keys before using this feature.';
        setApiKeyError(errorMsg);
        console.warn('No License Keys found. Response:', result);
        console.warn('Organization ID used:', validOrganizationId);
      }
    } catch (err: any) {
      console.error('Failed to load License Key:', err);
      setApiKeyError(
        `Failed to load License Key: ${err.message || 'Please check your connection and try again.'}`
      );
    } finally {
      setLoadingApiKey(false);
    }
  }, [currentUser, token]);

  const loadEmployees = useCallback(async () => {
    console.log('🔵 loadEmployees called!', {
      hasUser: !!currentUser,
      userId: currentUser?.id,
    });

    if (!currentUser) {
      console.log('No current user, cannot load employees');
      setLoadingEmployees(false);
      setEmployeeError('Please log in to load employees.');
      return;
    }

    const organizationId = currentUser?.organization_id;

    if (organizationId) {
      console.log('🔵 Loading employees, currentUser:', {
        id: currentUser.id,
        email: currentUser.email,
        organizationId: currentUser.organization_id,
      });
    } else {
      console.warn('🔵 No organizationId on user, will try to fetch all users');
    }

    try {
      console.log('🔵 Setting loading state and clearing errors');
      setLoadingEmployees(true);
      setEmployeeError(null);

      if (!token) {
        console.error('No auth token available');
        setEmployeeError('Please log in to load employees');
        setLoadingEmployees(false);
        return;
      }

      console.log(
        'Loading employees, organizationId:',
        currentUser.organization_id
      );

      // Add timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        // Fetch all users (employees) - fetch all users regardless of organization
        const url = `/api/v1/users?limit=100`;
        console.log('Fetching users from:', url);
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        console.log(
          'Users API response status:',
          response.status,
          response.statusText
        );

        clearTimeout(timeoutId);

        console.log('Response status:', response.status, response.statusText);
        console.log(
          'Response headers:',
          Object.fromEntries(response.headers.entries())
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Users API error:', response.status, errorText);
          setEmployeeError(
            `Failed to load employees: ${response.status}. ${errorText}`
          );
          setLoadingEmployees(false);
          return;
        }

        const responseText = await response.text();
        console.log('Raw API response text:', responseText);

        let result;
        try {
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse JSON response:', parseError);
          setEmployeeError(
            `Failed to parse API response. Check console for details.`
          );
          setLoadingEmployees(false);
          return;
        }

        console.log('Parsed API response:', result);
        console.log('Response has success:', result.success);
        console.log('Response has data:', !!result.data);
        console.log('Response has users:', !!result.data?.users);
        console.log('Users array:', result.data?.users);

        // Check if API returned an error format
        if (result.error && !result.success) {
          setEmployeeError(
            result.error || result.details || 'Failed to load employees'
          );
          setEmployees([]);
          setLoadingEmployees(false);
          return;
        }

        // Check if result has success and data structure
        console.log('Full API response structure:', {
          success: result.success,
          hasData: !!result.data,
          hasUsers: !!result.data?.users,
          usersType: typeof result.data?.users,
          usersIsArray: Array.isArray(result.data?.users),
          usersLength: result.data?.users?.length,
          fullResult: result,
        });

        // Handle different response structures
        let usersArray = null;
        if (
          result.success &&
          result.data?.users &&
          Array.isArray(result.data.users)
        ) {
          usersArray = result.data.users;
        } else if (result.data?.users && Array.isArray(result.data.users)) {
          // Try without checking success flag
          usersArray = result.data.users;
          console.warn('Response missing success flag but has users array');
        } else if (result.users && Array.isArray(result.users)) {
          // Alternative structure
          usersArray = result.users;
          console.warn('Using alternative response structure (result.users)');
        } else if (Array.isArray(result)) {
          // Direct array response
          usersArray = result;
          console.warn('Response is direct array');
        }

        if (usersArray && usersArray.length > 0) {
          console.log('✓ Processing users:', usersArray.length, 'users found');
          console.log(
            'All users from API:',
            JSON.stringify(usersArray, null, 2)
          );

          // Include ALL users - everyone can be an employee for simulation
          // Show all users from the database
          const activeEmployees = usersArray.map((u: any) => {
            console.log('Processing user:', {
              id: u.id,
              name: u.name || u.display_name,
              email: u.email,
              status: u.status,
              role: u.role,
              allFields: Object.keys(u),
            });

            return {
              id: u.id,
              name:
                u.name ||
                u.display_name ||
                u.email?.split('@')[0] ||
                'Employee',
              email: u.email,
              role: u.role || 'user',
              organization_id: u.organization_id || currentUser.organization_id,
            };
          });

          console.log('Filtered employees:', activeEmployees);
          setEmployees(activeEmployees);
          setLoadingEmployees(false);

          // Auto-select first employee if available
          if (activeEmployees.length > 0 && !selectedEmployee) {
            setSelectedEmployee(activeEmployees[0]);
          }

          // If no employees found, show helpful message
          if (activeEmployees.length === 0) {
            console.error('No users found after mapping!', {
              usersArrayLength: usersArray.length,
              usersArray,
              activeEmployees,
            });
            setEmployeeError(
              `No users found after processing. Please check the Users section.`
            );
          } else {
            console.log(
              '✓ Successfully loaded',
              activeEmployees.length,
              'user(s) for dropdown:',
              activeEmployees.map(
                (e: any) => `${e.name || e.email} (${e.email})`
              )
            );
          }
        } else {
          // Check if result has a different structure or error
          console.error('❌ No users found in response:', {
            success: result.success,
            hasData: !!result.data,
            hasUsers: !!result.data?.users,
            usersValue: result.data?.users,
            usersArray: usersArray,
            resultKeys: Object.keys(result),
            fullResult: result,
          });
          setEmployeeError(
            `No users found in API response. Response structure: ${JSON.stringify(Object.keys(result)).substring(0, 100)}... Check console for full details.`
          );
          setLoadingEmployees(false);
          setEmployees([]);
          if (result.data?.users === undefined && result.users) {
            // Try alternative structure
            const users = Array.isArray(result.users) ? result.users : [];
            const activeEmployees = users
              .filter(
                (u: any) =>
                  (u.is_active || u.status === 'active') &&
                  u.id !== currentUser.id
              )
              .map((u: any) => ({
                id: u.id,
                name:
                  u.name ||
                  u.display_name ||
                  u.email?.split('@')[0] ||
                  'Employee',
                email: u.email,
                role: u.role || 'user',
                organization_id:
                  u.organization_id || currentUser.organization_id,
              }));
            setEmployees(activeEmployees);
            setLoadingEmployees(false);
            if (activeEmployees.length > 0 && !selectedEmployee) {
              setSelectedEmployee(activeEmployees[0]);
            }
          } else {
            // No users found or unexpected structure
            console.warn('No users found or unexpected response structure');
            setEmployees([]);
            setLoadingEmployees(false);
            if (!result.error) {
              setEmployeeError(
                'No employees found. Please create users in the Users section.'
              );
            }
          }
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('Request timeout');
          setEmployeeError(
            'Request timeout. The API may be slow or unavailable.'
          );
        } else {
          console.error('Fetch error:', fetchError);
          setEmployeeError(
            fetchError.message ||
              'Failed to load employees. Please check your connection.'
          );
        }
        setEmployees([]);
      }
    } catch (err) {
      console.error('Failed to load employees:', err);
      setEmployees([]);
      setEmployeeError(
        err instanceof Error
          ? err.message
          : 'Failed to load employees. Please check your connection.'
      );
    } finally {
      setLoadingEmployees(false);
    }
  }, [currentUser, selectedEmployee, token]);

  // Automatically fetch License Key and employees from database
  useEffect(() => {
    console.log('🔵 TEST-SANITIZATION: useEffect triggered!', {
      hasUser: !!currentUser,
      userId: currentUser?.id,
      userEmail: currentUser?.email,
      organizationId:
        currentUser?.organization_id || (currentUser as any)?.organizationId,
    });

    if (currentUser?.id) {
      // Try to load even without organizationId - we'll use a default or fetch all
      console.log('🔵 TEST-SANITIZATION: User found, loading data...');
      if (currentUser.organization_id || (currentUser as any)?.organizationId) {
        console.log(
          '🔵 Found organization_id on user, fetching users for organization:',
          currentUser.organization_id
        );
      } else {
        console.warn(
          '🔵 No organizationId on user, will try to fetch all users'
        );
      }
      loadApiKey();
      loadEmployees();
    } else {
      console.log('🔵 TEST-SANITIZATION: No currentUser found yet, waiting...');
      setLoadingEmployees(false);
    }
  }, [currentUser?.id, currentUser, loadApiKey, loadEmployees]); // Trigger when user is loaded

  const examplePrompts = [
    {
      title: 'PHI Example',
      prompt:
        'My patient John Doe, SSN 123-45-6789, DOB 01/15/1980, MRN 1234567, phone (555) 123-4567 has been experiencing persistent headaches for 2 weeks. What are the most common causes of chronic headaches in a 43-year-old patient?',
    },
    {
      title: 'PII Example',
      prompt:
        "I'm Jane Smith, email jane.smith@company.com, credit card 4111 1111 1111 1111. What should I do if I think my credit card information has been compromised?",
    },
    {
      title: 'Financial Data',
      prompt:
        'Account holder with bank account 123456789, routing 021000021, SSN 987-65-4321 is concerned about fraudulent charges. What are the best security practices for online banking?',
    },
    {
      title: 'Government Data',
      prompt:
        'Someone with passport number 123456789, case number US-2024-12345 needs to understand visa processing times. What is the typical timeline for visa applications?',
    },
  ];

  const handleTest = async () => {
    if (!prompt.trim()) {
      alert('Please enter a prompt');
      return;
    }

    if (!selectedEmployee) {
      alert('Please select an employee to simulate this request as.');
      return;
    }

    // For simulation: We use Bearer token authentication, so License Keys are NOT required
    // The frontend check is just informational - Bearer token will work for simulation
    // Provider API keys (OpenAI, etc.) are required for actual AI calls - those are configured separately

    if (loadingApiKey) {
      alert('Still loading configuration. Please wait a moment and try again.');
      return;
    }

    // Note: We don't block on License Keys for simulation - Bearer token works fine
    // Provider API keys are what matter for making actual AI calls

    setLoading(true);
    setResults(null);

    try {
      // In a real customer front-end application:
      // - The License Key would be stored in environment variables or secure config
      // - It would be set once by DevOps during deployment
      // - Employees never see or enter License Keys
      // - The front-end automatically includes it in X-API-Key header
      //   Example: headers['X-API-Key'] = process.env.NODE2AI_LICENSE_KEY

      // For this simulation:
      // - We've verified a License Key exists for the organization (configured by admin)
      // - Since we can't retrieve the actual key value (security: keys are only shown once),
      //   we'll use Bearer token authentication which identifies the organization
      // - The backend accepts both X-API-Key and Bearer token authentication
      // - The backend will use the organization's Provider API keys (e.g., OpenAI keys) internally

      if (!token) {
        throw new Error('Authentication required. Please log in again.');
      }

      // Build headers - using Bearer token for simulation
      // In production, customer front-ends would use: headers['X-API-Key'] = process.env.NODE2AI_API_KEY
      const headers: HeadersInit = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };

      // Add employee/user identification (for usage tracking)
      // In a real customer front-end, this would be the logged-in employee making the request
      if (selectedEmployee) {
        headers['X-User-Email'] = selectedEmployee.email;
        headers['X-User-ID'] = selectedEmployee.id;
      }

      // Use Next.js rewrite to proxy API requests (configured in next.config.js)
      // This avoids CORS issues by proxying through the web server
      const endpoint = `/api/v1/chat/completions`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          // Leave model undefined to use intelligent routing
          // model: 'gpt-4',
          sanitize_input: true,
          sanitize_output: true,
          sanitization_config: {
            enablePII: true,
            enablePHI: true,
            enableFinancial: true,
            enableGovernment: true,
            auditLevel: 'COMPREHENSIVE',
          },
        }),
      });

      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        console.error('Non-JSON response:', text.substring(0, 500));
        throw new Error(
          `Server returned non-JSON response. Status: ${response.status}. Check console for details.`
        );
      }

      const data = await response.json();
      console.log('Chat completions response:', data);

      if (!response.ok) {
        const errorMsg = data.error || data.message || 'Request failed';
        console.error('API request failed:', {
          status: response.status,
          statusText: response.statusText,
          error: errorMsg,
          fullResponse: data,
        });
        throw new Error(errorMsg);
      }

      // Check if response indicates missing provider keys
      if (
        data.error &&
        (data.error.includes('provider') ||
          data.error.includes('API key') ||
          data.error.includes('configured'))
      ) {
        console.error('Provider key issue detected:', data.error);
        throw new Error(
          `Backend configuration issue: ${data.error}. Please ensure provider keys (e.g., OpenAI) are configured in Settings > Provider Keys.`
        );
      }

      // Extract sanitized prompt from metadata if available
      const sanitizedPrompt =
        data.metadata?.sanitization?.sanitizedInput || prompt;

      // Get sanitized and desanitized responses from metadata
      const sanitizedResponse =
        data.metadata?.sanitization?.sanitizedResponse ||
        data.data?.choices?.[0]?.message?.content;
      const desanitizedResponse =
        data.metadata?.sanitization?.desanitizedResponse ||
        data.data?.choices?.[0]?.message?.content;

      setResults({
        prompt,
        sanitizedPrompt,
        response: data.data?.choices?.[0]?.message?.content || 'No response',
        sanitized: sanitizedResponse || 'No response',
        desanitized: desanitizedResponse || 'No response',
        model: data.data?.model,
        metadata: data.metadata,
      });
    } catch (error: any) {
      console.error('Test failed:', error);

      let errorMessage = error.message || 'Failed to test sanitization';

      // More specific error messages
      if (
        errorMessage.includes('Failed to fetch') ||
        errorMessage.includes('NetworkError')
      ) {
        errorMessage =
          'Failed to connect to API. Make sure the API server is running on port 3001.';
      } else if (
        errorMessage.includes('No provider API keys') ||
        errorMessage.includes('provider.*key')
      ) {
        errorMessage = errorMessage; // Use the exact error message from backend
      } else if (
        errorMessage.includes('All providers failed') ||
        errorMessage.includes('Provider') ||
        errorMessage.includes('trouble connecting')
      ) {
        errorMessage =
          "We're having trouble connecting to the model provider. This might be temporary - please try again in a moment. Check console for details.";
      } else if (errorMessage.includes('CORS')) {
        errorMessage = 'CORS error. Check API server CORS configuration.';
      } else if (
        errorMessage.includes('Authentication required') ||
        errorMessage.includes('401')
      ) {
        errorMessage =
          'Authentication failed. Please check your License Key configuration.';
      }

      setResults({
        prompt,
        response: '',
        sanitized: '',
        metadata: null,
        error: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExample = (examplePrompt: string) => {
    setPrompt(examplePrompt);
  };

  const handleClear = () => {
    setPrompt('');
    setResults(null);
  };

  return (
    <PageLayout>
      <div className="mx-auto w-full max-w-6xl px-4 pb-6 pt-2 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div className="flex items-center gap-2">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Customer Front-End Simulation
            </h1>
            <div className="relative">
              <button
                type="button"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <InformationCircleIcon className="h-5 w-5" />
              </button>
              {showTooltip && (
                <div className="absolute left-0 top-8 z-10 w-80 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-[#242424] dark:bg-[#1a1a1a]">
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    <strong>How it works:</strong> This simulates your
                    organization&apos;s front-end application:
                    <br />
                    1. <strong>Employee</strong> (you) enters prompt - no keys
                    needed!
                    <br />
                    2. Front-end automatically uses organization&apos;s License
                    Key (configured by admin)
                    <br />
                    3. Node2AI sanitizes input, routes to AI model using
                    admin-configured Provider API keys
                    <br />
                    4. Response returned, usage tracked to employee
                    <br />
                    5. Audit logged to PostgreSQL and Blockchain
                  </p>
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Simulate how your organization&apos;s <strong>employees</strong>{' '}
            interact with Node2AI through your front-end application. License
            Keys and Provider API keys are managed by administrators, not
            employees.
          </p>
        </div>

        {/* License Key Status */}
        {loadingApiKey && (
          <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-900/20">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Loading License Key configuration...
            </p>
          </div>
        )}

        {apiKeyError && !apiKey && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {apiKeyError}
            </p>
          </div>
        )}

        {!loadingApiKey && apiKey && (
          <div className="mb-4">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              ✓ License Key configured automatically (using Bearer token for
              this simulation)
            </p>
          </div>
        )}

        {/* Example Prompts */}
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
            Quick Examples
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
            {examplePrompts.map((example, index) => (
              <button
                key={index}
                onClick={() => handleExample(example.prompt)}
                className="rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:bg-gray-50 dark:border-[#242424] dark:bg-[#000000] dark:hover:bg-gray-800"
              >
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                  {example.title}
                </h3>
                <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-400">
                  {example.prompt}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Employee Selection */}
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="card-title">Select Employee (User)</h3>
            <p className="card-description">
              Select which employee is making this request. Usage will be
              tracked to this employee.
            </p>
          </div>
          <div className="card-content">
            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Employee (User) <span className="text-red-500">*</span>
                </label>
                {loadingEmployees ? (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-gray-400"></div>
                    Loading employees...
                  </div>
                ) : employeeError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-900/20">
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {employeeError}
                    </p>
                    <button
                      onClick={() => {
                        console.log('🔵 Manual retry clicked');
                        loadEmployees();
                      }}
                      className="mt-2 rounded-md bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                    >
                      Retry Loading Employees
                    </button>
                  </div>
                ) : employees.length === 0 ? (
                  <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-900/20">
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      No employees found. Please create users in the Users
                      section.
                    </p>
                    <button
                      onClick={() => {
                        console.log('🔵 Manual load clicked');
                        loadEmployees();
                      }}
                      className="mt-2 rounded-md bg-yellow-600 px-3 py-1 text-xs text-white hover:bg-yellow-700 dark:bg-yellow-700 dark:hover:bg-yellow-800"
                    >
                      Try Loading Again
                    </button>
                  </div>
                ) : (
                  <select
                    value={selectedEmployee?.id || ''}
                    onChange={e => {
                      const employee = employees.find(
                        emp => emp.id === e.target.value
                      );
                      setSelectedEmployee(employee || null);
                    }}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-[#242424] dark:bg-gray-800 dark:text-white"
                  >
                    <option value="">-- Select an employee --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.email}) - {emp.role}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedEmployee && (
                <div className="mt-2">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    <strong>Simulating as:</strong> {selectedEmployee.name} (
                    {selectedEmployee.email})
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Test Form */}
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="card-title">Test Sanitization</h3>
            <p className="card-description">
              Enter a prompt with sensitive data to test sanitization
            </p>
          </div>
          <div className="card-content space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Prompt
              </label>
              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Enter your prompt with sensitive data (SSN, email, phone, etc.)"
                className="input min-h-[120px]"
                rows={5}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClear}
                className="rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-[#242424] dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Clear
              </button>
              <button
                onClick={handleTest}
                disabled={loading || !prompt.trim()}
                className="rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent dark:border-[#242424] dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {loading ? (
                  <>
                    <div className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-b-2 border-gray-600 dark:border-gray-400"></div>
                    Testing...
                  </>
                ) : (
                  'Test Sanitization'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Results */}
        {results && (
          <>
            {/* Sanitization Metadata */}
            {results.metadata && (
              <div className="card mb-6">
                <div className="card-header">
                  <h3 className="card-title">Sanitization Metadata</h3>
                  <p className="card-description">
                    Information about detected sensitive data
                  </p>
                </div>
                <div className="card-content">
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded-lg border border-gray-200 p-3 dark:border-[#242424]">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Input Sanitized
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {results.metadata.sanitization?.inputSanitized ? (
                          <span className="text-green-600">Yes</span>
                        ) : (
                          <span className="text-red-600">No</span>
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-3 dark:border-[#242424]">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Output Sanitized
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        {results.metadata.sanitization?.outputSanitized ? (
                          <span className="text-green-600">Yes</span>
                        ) : (
                          <span className="text-red-600">No</span>
                        )}
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-3 dark:border-[#242424]">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Input Risk Level
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        <span
                          className={
                            results.metadata.sanitization?.inputRiskLevel ===
                            'none'
                              ? 'text-green-600'
                              : results.metadata.sanitization
                                    ?.inputRiskLevel === 'low'
                                ? 'text-yellow-600'
                                : results.metadata.sanitization
                                      ?.inputRiskLevel === 'medium'
                                  ? 'text-orange-600'
                                  : results.metadata.sanitization
                                        ?.inputRiskLevel === 'high'
                                    ? 'text-red-600'
                                    : 'text-red-800'
                          }
                        >
                          {results.metadata.sanitization?.inputRiskLevel ||
                            'none'}
                        </span>
                      </p>
                    </div>

                    <div className="rounded-lg border border-gray-200 p-3 dark:border-[#242424]">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Output Risk Level
                      </p>
                      <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">
                        <span
                          className={
                            results.metadata.sanitization?.outputRiskLevel ===
                            'none'
                              ? 'text-green-600'
                              : 'text-yellow-600'
                          }
                        >
                          {results.metadata.sanitization?.outputRiskLevel ||
                            'none'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-6">
                    <div>
                      {results.metadata.sanitization?.entitiesDetected &&
                      results.metadata.sanitization.entitiesDetected.length >
                        0 ? (
                        <>
                          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                            Detected Entities
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {results.metadata.sanitization.entitiesDetected.map(
                              (entity: string, index: number) => (
                                <span
                                  key={index}
                                  className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                >
                                  {entity}
                                </span>
                              )
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                            Detected Entities
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            None
                          </p>
                        </>
                      )}
                    </div>

                    <div>
                      {results.metadata.sanitization?.complianceFlags &&
                      (results.metadata.sanitization.complianceFlags.input
                        ?.length > 0 ||
                        results.metadata.sanitization.complianceFlags.output
                          ?.length > 0) ? (
                        <>
                          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                            Compliance Flags
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {results.metadata.sanitization.complianceFlags.input?.map(
                              (flag: string, index: number) => (
                                <span
                                  key={`input-${index}`}
                                  className="inline-flex items-center rounded-md bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                >
                                  Input: {flag}
                                </span>
                              )
                            )}
                            {results.metadata.sanitization.complianceFlags.output?.map(
                              (flag: string, index: number) => (
                                <span
                                  key={`output-${index}`}
                                  className="inline-flex items-center rounded-md bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                >
                                  Output: {flag}
                                </span>
                              )
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mb-2 text-xs font-medium text-gray-700 dark:text-gray-300">
                            Compliance Flags
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-500">
                            None
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {results.error && (
              <div className="card mb-6 border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/20">
                <div className="card-content">
                  <h3 className="text-lg font-semibold text-red-800 dark:text-red-400">
                    Error
                  </h3>
                  <p className="mt-2 text-red-700 dark:text-red-300">
                    {results.error}
                  </p>
                </div>
              </div>
            )}

            {/* Original vs Sanitized */}
            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Your Original Input</h3>
                  <p className="card-description">Contains sensitive data</p>
                </div>
                <div className="card-content">
                  <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                    {results.prompt}
                  </p>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Sanitized Prompt</h3>
                  <p className="card-description">
                    Sent to AI (PHI/PII removed)
                  </p>
                </div>
                <div className="card-content">
                  {results.sanitizedPrompt ? (
                    <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                      {results.sanitizedPrompt}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Sanitization disabled
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* AI Response - Side by Side Comparison */}
            {results.response && (
              <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="card">
                  <div className="card-header">
                    <h3 className="card-title">Sanitized Response</h3>
                    <p className="card-description">
                      What AI provider received and returned (with tokens)
                    </p>
                  </div>
                  <div className="card-content">
                    <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                      {results.sanitized || results.response}
                    </p>
                  </div>
                </div>

                <div className="card border-green-500 dark:border-green-600">
                  <div className="card-header">
                    <h3 className="card-title">Desanitized Response</h3>
                    <p className="card-description">
                      What user sees (original data restored)
                    </p>
                  </div>
                  <div className="card-content">
                    <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white">
                      {results.desanitized || results.response}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Additional Metadata */}
            {results.metadata && (
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Request Details</h3>
                </div>
                <div className="card-content">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Provider
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {results.metadata.provider || 'smart-router'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Model
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {results.model || 'unknown'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Latency
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {results.metadata.latency}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        Cost
                      </span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {results.metadata.cost}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
}
