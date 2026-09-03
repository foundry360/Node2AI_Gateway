#!/usr/bin/env ts-node

/**
 * Node2AI Provider Key Management Test Script
 * Tests the provider key management system including encryption, API validation, and CRUD operations
 */

import axios, { AxiosResponse } from 'axios';
import * as crypto from 'crypto';

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3001';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-here';

// Test data
const TEST_PROVIDER_KEYS = [
  {
    provider: 'openai',
    apiKey: 'sk-test-openai-key-123456789',
    keyMetadata: {
      model: 'gpt-4',
      region: 'us-east-1',
      environment: 'production',
      description: 'Production OpenAI key for customer support',
    },
  },
  {
    provider: 'anthropic',
    apiKey: 'sk-ant-test-anthropic-key-123456789',
    keyMetadata: {
      model: 'claude-3-sonnet-20240229',
      region: 'us-west-2',
      environment: 'staging',
      description: 'Staging Anthropic key for testing',
    },
  },
  {
    provider: 'google',
    apiKey: 'AIzaSyTest-google-key-123456789',
    keyMetadata: {
      model: 'gemini-pro',
      region: 'us-central1',
      environment: 'development',
      description: 'Development Google key for experiments',
    },
  },
  {
    provider: 'perplexity',
    apiKey: 'pplx-test-perplexity-key-123456789',
    keyMetadata: {
      model: 'llama-3.1-sonar-small-128k-online',
      region: 'us-east-1',
      environment: 'production',
      description: 'Production Perplexity key for research',
    },
  },
];

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
 * Generate JWT token for authentication
 */
function generateJWT(payload: any): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
    'base64url'
  );
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    'base64url'
  );

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

/**
 * Make authenticated request
 */
async function makeRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  data?: any
): Promise<AxiosResponse> {
  const token = generateJWT({
    userId: 'test-user-123',
    organizationId: 'default-org',
    role: 'admin',
    permissions: ['*'],
  });

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const config = {
    method,
    url: `${API_BASE_URL}${endpoint}`,
    headers,
    data,
  };

  return axios(config);
}

/**
 * Test provider key creation
 */
async function testProviderKeyCreation(): Promise<void> {
  log.test('Testing Provider Key Creation...');

  for (const testKey of TEST_PROVIDER_KEYS) {
    try {
      const response = await makeRequest(
        '/api/v1/provider-keys',
        'POST',
        testKey
      );

      if (response.status === 200 && response.data.success) {
        testResults.push({
          name: `Create Provider Key - ${testKey.provider}`,
          passed: true,
          response: response.data,
        });
        log.success(`Provider key created for ${testKey.provider}`);
      } else {
        testResults.push({
          name: `Create Provider Key - ${testKey.provider}`,
          passed: false,
          error: `Unexpected status: ${response.status}`,
        });
        log.error(
          `Failed to create provider key for ${testKey.provider}: ${response.status}`
        );
      }
    } catch (error: any) {
      testResults.push({
        name: `Create Provider Key - ${testKey.provider}`,
        passed: false,
        error: error.message,
      });
      log.error(
        `Failed to create provider key for ${testKey.provider}: ${error.message}`
      );
    }
  }
}

/**
 * Test provider key listing
 */
async function testProviderKeyListing(): Promise<void> {
  log.test('Testing Provider Key Listing...');

  try {
    const response = await makeRequest('/api/v1/provider-keys', 'GET');

    if (response.status === 200 && response.data.success) {
      const providerKeys = response.data.data.provider_keys;

      testResults.push({
        name: 'List Provider Keys',
        passed: true,
        response: { count: providerKeys.length },
      });
      log.success(`Retrieved ${providerKeys.length} provider keys`);

      // Verify keys are masked
      const allKeysMasked = providerKeys.every(
        (key: any) => key.encryptedKey && key.encryptedKey.endsWith('...')
      );

      if (allKeysMasked) {
        testResults.push({
          name: 'Provider Keys Masked',
          passed: true,
        });
        log.success('All provider keys are properly masked');
      } else {
        testResults.push({
          name: 'Provider Keys Masked',
          passed: false,
          error: 'Some provider keys are not properly masked',
        });
        log.error('Some provider keys are not properly masked');
      }
    } else {
      testResults.push({
        name: 'List Provider Keys',
        passed: false,
        error: `Unexpected status: ${response.status}`,
      });
      log.error(`Failed to list provider keys: ${response.status}`);
    }
  } catch (error: any) {
    testResults.push({
      name: 'List Provider Keys',
      passed: false,
      error: error.message,
    });
    log.error(`Failed to list provider keys: ${error.message}`);
  }
}

/**
 * Test provider key testing
 */
async function testProviderKeyTesting(): Promise<void> {
  log.test('Testing Provider Key Testing...');

  try {
    // First, get the list of provider keys
    const listResponse = await makeRequest('/api/v1/provider-keys', 'GET');

    if (listResponse.status !== 200 || !listResponse.data.success) {
      testResults.push({
        name: 'Test Provider Keys - Setup',
        passed: false,
        error: 'Failed to get provider keys for testing',
      });
      return;
    }

    const providerKeys = listResponse.data.data.provider_keys;

    for (const key of providerKeys.slice(0, 2)) {
      // Test first 2 keys
      try {
        const testResponse = await makeRequest(
          `/api/v1/provider-keys/${key.id}/test`,
          'POST'
        );

        if (testResponse.status === 200 && testResponse.data.success) {
          testResults.push({
            name: `Test Provider Key - ${key.provider}`,
            passed: true,
            response: testResponse.data,
          });
          log.success(`Provider key test completed for ${key.provider}`);
        } else {
          testResults.push({
            name: `Test Provider Key - ${key.provider}`,
            passed: false,
            error: `Test failed: ${testResponse.data.message}`,
          });
          log.error(
            `Provider key test failed for ${key.provider}: ${testResponse.data.message}`
          );
        }
      } catch (error: any) {
        testResults.push({
          name: `Test Provider Key - ${key.provider}`,
          passed: false,
          error: error.message,
        });
        log.error(
          `Provider key test failed for ${key.provider}: ${error.message}`
        );
      }
    }
  } catch (error: any) {
    testResults.push({
      name: 'Test Provider Keys - Setup',
      passed: false,
      error: error.message,
    });
    log.error(`Failed to test provider keys: ${error.message}`);
  }
}

/**
 * Test provider key updates
 */
async function testProviderKeyUpdates(): Promise<void> {
  log.test('Testing Provider Key Updates...');

  try {
    // First, get the list of provider keys
    const listResponse = await makeRequest('/api/v1/provider-keys', 'GET');

    if (listResponse.status !== 200 || !listResponse.data.success) {
      testResults.push({
        name: 'Update Provider Keys - Setup',
        passed: false,
        error: 'Failed to get provider keys for updating',
      });
      return;
    }

    const providerKeys = listResponse.data.data.provider_keys;

    if (providerKeys.length > 0) {
      const keyToUpdate = providerKeys[0];

      try {
        const updateResponse = await makeRequest(
          `/api/v1/provider-keys/${keyToUpdate.id}`,
          'PUT',
          {
            keyMetadata: {
              ...keyToUpdate.keyMetadata,
              description: 'Updated description for testing',
            },
          }
        );

        if (updateResponse.status === 200 && updateResponse.data.success) {
          testResults.push({
            name: 'Update Provider Key',
            passed: true,
            response: updateResponse.data,
          });
          log.success('Provider key updated successfully');
        } else {
          testResults.push({
            name: 'Update Provider Key',
            passed: false,
            error: `Update failed: ${updateResponse.data.message}`,
          });
          log.error(
            `Failed to update provider key: ${updateResponse.data.message}`
          );
        }
      } catch (error: any) {
        testResults.push({
          name: 'Update Provider Key',
          passed: false,
          error: error.message,
        });
        log.error(`Failed to update provider key: ${error.message}`);
      }
    } else {
      testResults.push({
        name: 'Update Provider Key',
        passed: false,
        error: 'No provider keys available for updating',
      });
      log.warning('No provider keys available for updating');
    }
  } catch (error: any) {
    testResults.push({
      name: 'Update Provider Keys - Setup',
      passed: false,
      error: error.message,
    });
    log.error(`Failed to update provider keys: ${error.message}`);
  }
}

/**
 * Test provider key deletion
 */
async function testProviderKeyDeletion(): Promise<void> {
  log.test('Testing Provider Key Deletion...');

  try {
    // First, get the list of provider keys
    const listResponse = await makeRequest('/api/v1/provider-keys', 'GET');

    if (listResponse.status !== 200 || !listResponse.data.success) {
      testResults.push({
        name: 'Delete Provider Keys - Setup',
        passed: false,
        error: 'Failed to get provider keys for deletion',
      });
      return;
    }

    const providerKeys = listResponse.data.data.provider_keys;

    if (providerKeys.length > 0) {
      const keyToDelete = providerKeys[providerKeys.length - 1]; // Delete the last one

      try {
        const deleteResponse = await makeRequest(
          `/api/v1/provider-keys/${keyToDelete.id}`,
          'DELETE'
        );

        if (deleteResponse.status === 200 && deleteResponse.data.success) {
          testResults.push({
            name: 'Delete Provider Key',
            passed: true,
            response: deleteResponse.data,
          });
          log.success('Provider key deleted successfully');
        } else {
          testResults.push({
            name: 'Delete Provider Key',
            passed: false,
            error: `Deletion failed: ${deleteResponse.data.message}`,
          });
          log.error(
            `Failed to delete provider key: ${deleteResponse.data.message}`
          );
        }
      } catch (error: any) {
        testResults.push({
          name: 'Delete Provider Key',
          passed: false,
          error: error.message,
        });
        log.error(`Failed to delete provider key: ${error.message}`);
      }
    } else {
      testResults.push({
        name: 'Delete Provider Key',
        passed: false,
        error: 'No provider keys available for deletion',
      });
      log.warning('No provider keys available for deletion');
    }
  } catch (error: any) {
    testResults.push({
      name: 'Delete Provider Keys - Setup',
      passed: false,
      error: error.message,
    });
    log.error(`Failed to delete provider keys: ${error.message}`);
  }
}

/**
 * Test encryption/decryption
 */
async function testEncryptionDecryption(): Promise<void> {
  log.test('Testing Encryption/Decryption...');

  try {
    // Test with a sample API key
    const testApiKey = 'sk-test-encryption-key-123456789';

    // This would normally be done by the encryption service
    // For testing, we'll verify the encryption key is configured
    const encryptionKey = process.env.PROVIDER_KEY_ENCRYPTION_KEY;

    if (encryptionKey && encryptionKey.length > 0) {
      testResults.push({
        name: 'Encryption Key Configuration',
        passed: true,
      });
      log.success('Encryption key is configured');
    } else {
      testResults.push({
        name: 'Encryption Key Configuration',
        passed: false,
        error: 'Provider key encryption key not configured',
      });
      log.error('Provider key encryption key not configured');
    }

    // Test encryption key format (should be hex)
    if (encryptionKey && /^[a-fA-F0-9]+$/.test(encryptionKey)) {
      testResults.push({
        name: 'Encryption Key Format',
        passed: true,
      });
      log.success('Encryption key has valid format');
    } else {
      testResults.push({
        name: 'Encryption Key Format',
        passed: false,
        error: 'Encryption key has invalid format (should be hex)',
      });
      log.error('Encryption key has invalid format');
    }
  } catch (error: any) {
    testResults.push({
      name: 'Encryption/Decryption',
      passed: false,
      error: error.message,
    });
    log.error(`Encryption/decryption test failed: ${error.message}`);
  }
}

/**
 * Test authentication and authorization
 */
async function testAuthentication(): Promise<void> {
  log.test('Testing Authentication and Authorization...');

  // Test without authentication
  try {
    await axios.get(`${API_BASE_URL}/api/v1/provider-keys`);
    testResults.push({
      name: 'Unauthenticated Access',
      passed: false,
      error: 'Should have failed but succeeded',
    });
    log.error('Unauthenticated access should have failed but succeeded');
  } catch (error: any) {
    if (error.response?.status === 401) {
      testResults.push({
        name: 'Unauthenticated Access',
        passed: true,
      });
      log.success('Unauthenticated access correctly rejected');
    } else {
      testResults.push({
        name: 'Unauthenticated Access',
        passed: false,
        error: `Unexpected error: ${error.message}`,
      });
      log.error(
        `Unauthenticated access failed with unexpected error: ${error.message}`
      );
    }
  }

  // Test with invalid token
  try {
    await axios.get(`${API_BASE_URL}/api/v1/provider-keys`, {
      headers: {
        Authorization: 'Bearer invalid-token',
        'Content-Type': 'application/json',
      },
    });
    testResults.push({
      name: 'Invalid Token Access',
      passed: false,
      error: 'Should have failed but succeeded',
    });
    log.error('Invalid token access should have failed but succeeded');
  } catch (error: any) {
    if (error.response?.status === 401) {
      testResults.push({
        name: 'Invalid Token Access',
        passed: true,
      });
      log.success('Invalid token access correctly rejected');
    } else {
      testResults.push({
        name: 'Invalid Token Access',
        passed: false,
        error: `Unexpected error: ${error.message}`,
      });
      log.error(
        `Invalid token access failed with unexpected error: ${error.message}`
      );
    }
  }
}

/**
 * Display test results summary
 */
function displayResults(): void {
  console.log('\n' + '='.repeat(60));
  log.info('PROVIDER KEY MANAGEMENT TEST RESULTS');
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
    log.success('All provider key management tests passed! 🎉');
  } else {
    log.error(`${failed} test(s) failed. Please check the errors above.`);
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Main test function
 */
async function runTests(): Promise<void> {
  log.info('Starting Node2AI Provider Key Management Tests...');
  log.info(`API Base URL: ${API_BASE_URL}`);
  log.info(`JWT Secret: ${JWT_SECRET ? 'Configured' : 'Not configured'}`);
  log.info(
    `Provider Key Encryption Key: ${process.env.PROVIDER_KEY_ENCRYPTION_KEY ? 'Configured' : 'Not configured'}`
  );
  console.log();

  try {
    // Run all tests
    await testEncryptionDecryption();
    await testAuthentication();
    await testProviderKeyCreation();
    await testProviderKeyListing();
    await testProviderKeyTesting();
    await testProviderKeyUpdates();
    await testProviderKeyDeletion();

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
