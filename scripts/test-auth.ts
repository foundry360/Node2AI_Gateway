#!/usr/bin/env ts-node

/**
 * Node2AI Authentication Test Script
 * Tests both JWT and API key authentication methods
 */

import axios, { AxiosResponse } from 'axios';
import * as bcrypt from 'bcryptjs';
import { generateJWT } from '../apps/api/src/lib/middleware/auth';

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-here';

// Test data
const TEST_DATA = {
  organization: {
    id: 'default-org',
    name: 'Default Organization',
  },
  users: [
    {
      id: 'admin-user-123',
      email: 'admin@node2.ai',
      role: 'admin',
      password: 'admin123',
    },
    {
      id: 'developer-user-456',
      email: 'developer@node2.ai',
      role: 'developer',
      password: 'dev123',
    },
    {
      id: 'viewer-user-789',
      email: 'viewer@node2.ai',
      role: 'viewer',
      password: 'view123',
    },
  ],
  apiKeys: [
    {
      id: 'default-api-key-123',
      key: 'test-api-key-123',
      name: 'Default API Key',
      role: 'admin',
    },
    {
      id: 'developer-api-key-456',
      key: 'dev-api-key-456',
      name: 'Developer API Key',
      role: 'developer',
    },
    {
      id: 'viewer-api-key-789',
      key: 'view-api-key-789',
      name: 'Viewer API Key',
      role: 'viewer',
    },
  ],
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Logging functions
const log = {
  info: (msg: string) =>
    console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg: string) =>
    console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`),
  warning: (msg: string) =>
    console.log(`${colors.yellow}[WARNING]${colors.reset} ${msg}`),
  error: (msg: string) =>
    console.log(`${colors.red}[ERROR]${colors.reset} ${msg}`),
  test: (msg: string) =>
    console.log(`${colors.cyan}[TEST]${colors.reset} ${msg}`),
};

// Test results tracking
interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  response?: any;
}

const testResults: TestResult[] = [];

/**
 * Make authenticated request
 */
async function makeRequest(
  endpoint: string,
  method: 'GET' | 'POST' = 'GET',
  auth: { type: 'jwt' | 'api_key'; token: string },
  data?: any
): Promise<AxiosResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (auth.type === 'jwt') {
    headers['Authorization'] = `Bearer ${auth.token}`;
  } else {
    headers['X-API-Key'] = auth.token;
  }

  const config = {
    method,
    url: `${API_BASE_URL}${endpoint}`,
    headers,
    data,
  };

  return axios(config);
}

/**
 * Test JWT authentication
 */
async function testJWTAuthentication(): Promise<void> {
  log.test('Testing JWT Authentication...');

  for (const user of TEST_DATA.users) {
    try {
      // Generate JWT token
      const token = generateJWT({
        userId: user.id,
        organizationId: TEST_DATA.organization.id,
        role: user.role,
        permissions: user.role === 'admin' ? ['*'] : ['read'],
      });

      // Test protected endpoint
      const response = await makeRequest('/api/health', 'GET', {
        type: 'jwt',
        token,
      });

      if (response.status === 200) {
        testResults.push({
          name: `JWT Auth - ${user.role}`,
          passed: true,
          response: response.data,
        });
        log.success(`JWT authentication passed for ${user.role}`);
      } else {
        testResults.push({
          name: `JWT Auth - ${user.role}`,
          passed: false,
          error: `Unexpected status: ${response.status}`,
        });
        log.error(
          `JWT authentication failed for ${user.role}: ${response.status}`
        );
      }
    } catch (error: any) {
      testResults.push({
        name: `JWT Auth - ${user.role}`,
        passed: false,
        error: error.message,
      });
      log.error(`JWT authentication failed for ${user.role}: ${error.message}`);
    }
  }
}

/**
 * Test API key authentication
 */
async function testAPIKeyAuthentication(): Promise<void> {
  log.test('Testing API Key Authentication...');

  for (const apiKey of TEST_DATA.apiKeys) {
    try {
      // Test protected endpoint
      const response = await makeRequest('/api/health', 'GET', {
        type: 'api_key',
        token: apiKey.key,
      });

      if (response.status === 200) {
        testResults.push({
          name: `API Key Auth - ${apiKey.role}`,
          passed: true,
          response: response.data,
        });
        log.success(`API key authentication passed for ${apiKey.role}`);
      } else {
        testResults.push({
          name: `API Key Auth - ${apiKey.role}`,
          passed: false,
          error: `Unexpected status: ${response.status}`,
        });
        log.error(
          `API key authentication failed for ${apiKey.role}: ${response.status}`
        );
      }
    } catch (error: any) {
      testResults.push({
        name: `API Key Auth - ${apiKey.role}`,
        passed: false,
        error: error.message,
      });
      log.error(
        `API key authentication failed for ${apiKey.role}: ${error.message}`
      );
    }
  }
}

/**
 * Test invalid credentials
 */
async function testInvalidCredentials(): Promise<void> {
  log.test('Testing Invalid Credentials...');

  // Test invalid JWT
  try {
    await makeRequest('/api/health', 'GET', {
      type: 'jwt',
      token: 'invalid-jwt-token',
    });
    testResults.push({
      name: 'Invalid JWT',
      passed: false,
      error: 'Should have failed but succeeded',
    });
    log.error('Invalid JWT should have failed but succeeded');
  } catch (error: any) {
    if (error.response?.status === 401) {
      testResults.push({
        name: 'Invalid JWT',
        passed: true,
      });
      log.success('Invalid JWT correctly rejected');
    } else {
      testResults.push({
        name: 'Invalid JWT',
        passed: false,
        error: `Unexpected error: ${error.message}`,
      });
      log.error(`Invalid JWT failed with unexpected error: ${error.message}`);
    }
  }

  // Test invalid API key
  try {
    await makeRequest('/api/health', 'GET', {
      type: 'api_key',
      token: 'invalid-api-key',
    });
    testResults.push({
      name: 'Invalid API Key',
      passed: false,
      error: 'Should have failed but succeeded',
    });
    log.error('Invalid API key should have failed but succeeded');
  } catch (error: any) {
    if (error.response?.status === 401) {
      testResults.push({
        name: 'Invalid API Key',
        passed: true,
      });
      log.success('Invalid API key correctly rejected');
    } else {
      testResults.push({
        name: 'Invalid API Key',
        passed: false,
        error: `Unexpected error: ${error.message}`,
      });
      log.error(
        `Invalid API key failed with unexpected error: ${error.message}`
      );
    }
  }

  // Test missing credentials
  try {
    await axios.get(`${API_BASE_URL}/api/health`);
    testResults.push({
      name: 'Missing Credentials',
      passed: false,
      error: 'Should have failed but succeeded',
    });
    log.error('Missing credentials should have failed but succeeded');
  } catch (error: any) {
    if (error.response?.status === 401) {
      testResults.push({
        name: 'Missing Credentials',
        passed: true,
      });
      log.success('Missing credentials correctly rejected');
    } else {
      testResults.push({
        name: 'Missing Credentials',
        passed: false,
        error: `Unexpected error: ${error.message}`,
      });
      log.error(
        `Missing credentials failed with unexpected error: ${error.message}`
      );
    }
  }
}

/**
 * Test role-based access control
 */
async function testRoleBasedAccess(): Promise<void> {
  log.test('Testing Role-Based Access Control...');

  // Test admin access
  try {
    const adminToken = generateJWT({
      userId: 'admin-user-123',
      organizationId: TEST_DATA.organization.id,
      role: 'admin',
      permissions: ['*'],
    });

    const response = await makeRequest('/api/v1/api-keys', 'GET', {
      type: 'jwt',
      token: adminToken,
    });

    if (response.status === 200) {
      testResults.push({
        name: 'Admin Access - API Keys',
        passed: true,
      });
      log.success('Admin can access API keys endpoint');
    } else {
      testResults.push({
        name: 'Admin Access - API Keys',
        passed: false,
        error: `Unexpected status: ${response.status}`,
      });
      log.error(`Admin access failed: ${response.status}`);
    }
  } catch (error: any) {
    testResults.push({
      name: 'Admin Access - API Keys',
      passed: false,
      error: error.message,
    });
    log.error(`Admin access failed: ${error.message}`);
  }

  // Test viewer access (should be restricted)
  try {
    const viewerToken = generateJWT({
      userId: 'viewer-user-789',
      organizationId: TEST_DATA.organization.id,
      role: 'viewer',
      permissions: ['read'],
    });

    const response = await makeRequest(
      '/api/v1/api-keys',
      'POST',
      {
        type: 'jwt',
        token: viewerToken,
      },
      {
        organization_id: TEST_DATA.organization.id,
        name: 'Test Key',
        scopes: ['read'],
        rate_limit: 100,
      }
    );

    if (response.status === 403) {
      testResults.push({
        name: 'Viewer Access - API Keys (Restricted)',
        passed: true,
      });
      log.success('Viewer correctly restricted from creating API keys');
    } else {
      testResults.push({
        name: 'Viewer Access - API Keys (Restricted)',
        passed: false,
        error: `Should have been forbidden but got status: ${response.status}`,
      });
      log.error(
        `Viewer should be restricted but got status: ${response.status}`
      );
    }
  } catch (error: any) {
    if (error.response?.status === 403) {
      testResults.push({
        name: 'Viewer Access - API Keys (Restricted)',
        passed: true,
      });
      log.success('Viewer correctly restricted from creating API keys');
    } else {
      testResults.push({
        name: 'Viewer Access - API Keys (Restricted)',
        passed: false,
        error: error.message,
      });
      log.error(`Viewer restriction failed: ${error.message}`);
    }
  }
}

/**
 * Test API endpoint protection
 */
async function testEndpointProtection(): Promise<void> {
  log.test('Testing API Endpoint Protection...');

  const protectedEndpoints = [
    '/api/v1/chat/smart',
    '/api/v1/api-keys',
    '/api/v1/analytics/dashboard',
    '/api/v1/sanitization/sanitize',
    '/api/v1/organizations',
  ];

  for (const endpoint of protectedEndpoints) {
    try {
      // Test without authentication
      await axios.get(`${API_BASE_URL}${endpoint}`);
      testResults.push({
        name: `Endpoint Protection - ${endpoint}`,
        passed: false,
        error: 'Should have required authentication but succeeded',
      });
      log.error(
        `Endpoint ${endpoint} should require authentication but succeeded`
      );
    } catch (error: any) {
      if (error.response?.status === 401) {
        testResults.push({
          name: `Endpoint Protection - ${endpoint}`,
          passed: true,
        });
        log.success(`Endpoint ${endpoint} correctly requires authentication`);
      } else {
        testResults.push({
          name: `Endpoint Protection - ${endpoint}`,
          passed: false,
          error: `Unexpected status: ${error.response?.status}`,
        });
        log.error(
          `Endpoint ${endpoint} failed with unexpected status: ${error.response?.status}`
        );
      }
    }
  }
}

/**
 * Test password hashing consistency
 */
async function testPasswordHashing(): Promise<void> {
  log.test('Testing Password Hashing Consistency...');

  const testPassword = 'test123';
  const saltRounds = 12;

  try {
    // Hash password
    const hash = bcrypt.hashSync(testPassword, saltRounds);

    // Verify hash
    const isValid = bcrypt.compareSync(testPassword, hash);

    if (isValid) {
      testResults.push({
        name: 'Password Hashing',
        passed: true,
      });
      log.success('Password hashing works correctly');
    } else {
      testResults.push({
        name: 'Password Hashing',
        passed: false,
        error: 'Password verification failed',
      });
      log.error('Password verification failed');
    }

    // Test with wrong password
    const isInvalid = bcrypt.compareSync('wrongpassword', hash);
    if (!isInvalid) {
      testResults.push({
        name: 'Password Hashing - Wrong Password',
        passed: true,
      });
      log.success('Wrong password correctly rejected');
    } else {
      testResults.push({
        name: 'Password Hashing - Wrong Password',
        passed: false,
        error: 'Wrong password should have been rejected',
      });
      log.error('Wrong password should have been rejected');
    }
  } catch (error: any) {
    testResults.push({
      name: 'Password Hashing',
      passed: false,
      error: error.message,
    });
    log.error(`Password hashing failed: ${error.message}`);
  }
}

/**
 * Test JWT token generation and validation
 */
async function testJWTTokenGeneration(): Promise<void> {
  log.test('Testing JWT Token Generation...');

  try {
    const payload = {
      userId: 'test-user-123',
      organizationId: 'test-org-123',
      role: 'admin',
      permissions: ['*'],
    };

    // Generate token
    const token = generateJWT(payload);

    if (token && token.length > 0) {
      testResults.push({
        name: 'JWT Generation',
        passed: true,
      });
      log.success('JWT token generated successfully');
    } else {
      testResults.push({
        name: 'JWT Generation',
        passed: false,
        error: 'JWT token is empty',
      });
      log.error('JWT token is empty');
    }

    // Test token structure (basic check)
    const parts = token.split('.');
    if (parts.length === 3) {
      testResults.push({
        name: 'JWT Structure',
        passed: true,
      });
      log.success('JWT token has correct structure');
    } else {
      testResults.push({
        name: 'JWT Structure',
        passed: false,
        error: 'JWT token does not have correct structure',
      });
      log.error('JWT token does not have correct structure');
    }
  } catch (error: any) {
    testResults.push({
      name: 'JWT Generation',
      passed: false,
      error: error.message,
    });
    log.error(`JWT generation failed: ${error.message}`);
  }
}

/**
 * Display test results summary
 */
function displayResults(): void {
  console.log('\n' + '='.repeat(60));
  log.info('AUTHENTICATION TEST RESULTS');
  console.log('='.repeat(60));

  const passed = testResults.filter(r => r.passed).length;
  const total = testResults.length;
  const failed = total - passed;

  console.log(`\nTotal Tests: ${total}`);
  log.success(`Passed: ${passed}`);
  if (failed > 0) {
    log.error(`Failed: ${failed}`);
  }

  console.log('\nDetailed Results:');
  console.log('-'.repeat(60));

  testResults.forEach(result => {
    const status = result.passed ? '✅' : '❌';
    const color = result.passed ? colors.green : colors.red;
    console.log(`${status} ${color}${result.name}${colors.reset}`);

    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });

  console.log('\n' + '='.repeat(60));

  if (failed === 0) {
    log.success('All authentication tests passed! 🎉');
  } else {
    log.error(`${failed} test(s) failed. Please check the errors above.`);
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Main test function
 */
async function runTests(): Promise<void> {
  log.info('Starting Node2AI Authentication Tests...');
  log.info(`API Base URL: ${API_BASE_URL}`);
  log.info(`JWT Secret: ${JWT_SECRET ? 'Configured' : 'Not configured'}`);
  console.log();

  try {
    // Run all tests
    await testPasswordHashing();
    await testJWTTokenGeneration();
    await testJWTAuthentication();
    await testAPIKeyAuthentication();
    await testInvalidCredentials();
    await testRoleBasedAccess();
    await testEndpointProtection();

    // Display results
    displayResults();

    // Exit with appropriate code
    const failed = testResults.filter(r => !r.passed).length;
    process.exit(failed > 0 ? 1 : 0);
  } catch (error: any) {
    log.error(`Test execution failed: ${error.message}`);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on('unhandledRejection', error => {
  log.error(`Unhandled rejection: ${error}`);
  process.exit(1);
});

process.on('uncaughtException', error => {
  log.error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  log.error(`Test runner failed: ${error.message}`);
  process.exit(1);
});
