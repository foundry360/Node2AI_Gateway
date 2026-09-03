#!/usr/bin/env ts-node

/**
 * Node2AI Seed Data Script
 * Creates default users, API keys, and sample data for testing
 */

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';

// Initialize Prisma client
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ||
        'postgresql://node2:node2123@localhost:5432/node2',
    },
  },
});

// Configuration
const SALT_ROUNDS = 12;
const SKIP_IF_EXISTS = process.argv.includes('--skip-if-exists');

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
  step: (msg: string) =>
    console.log(`${colors.cyan}[STEP]${colors.reset} ${msg}`),
};

// Default data configuration
const DEFAULT_DATA = {
  organization: {
    id: 'default-org',
    name: 'Default Organization',
    deploymentMode: 'self-hosted',
    licenseTier: 'enterprise',
    isActive: true,
  },
  users: [
    {
      id: 'admin-user-123',
      email: 'admin@node2.ai',
      name: 'Administrator',
      role: 'admin',
      password: 'admin123',
      isActive: true,
    },
    {
      id: 'developer-user-456',
      email: 'developer@node2.ai',
      name: 'Developer User',
      role: 'developer',
      password: 'dev123',
      isActive: true,
    },
    {
      id: 'viewer-user-789',
      email: 'viewer@node2.ai',
      name: 'Viewer User',
      role: 'viewer',
      password: 'view123',
      isActive: true,
    },
    {
      id: 'auditor-user-101',
      email: 'auditor@node2.ai',
      name: 'Auditor User',
      role: 'auditor',
      password: 'audit123',
      isActive: true,
    },
  ],
  apiKeys: [
    {
      id: 'default-api-key-123',
      name: 'Default API Key',
      key: 'test-api-key-123',
      rateLimitPerMinute: 1000,
      expiresAt: null,
      isActive: true,
    },
    {
      id: 'developer-api-key-456',
      name: 'Developer API Key',
      key: 'dev-api-key-456',
      rateLimitPerMinute: 500,
      expiresAt: null,
      isActive: true,
    },
    {
      id: 'viewer-api-key-789',
      name: 'Viewer API Key',
      key: 'view-api-key-789',
      rateLimitPerMinute: 100,
      expiresAt: null,
      isActive: true,
    },
  ],
  providerKeys: [
    {
      provider: 'openai',
      encryptedKey: 'encrypted-openai-key-placeholder',
      keyMetadata: {
        model: 'gpt-4',
        region: 'us-east-1',
      },
      isActive: true,
    },
    {
      provider: 'anthropic',
      encryptedKey: 'encrypted-anthropic-key-placeholder',
      keyMetadata: {
        model: 'claude-3-sonnet',
        region: 'us-east-1',
      },
      isActive: true,
    },
    {
      provider: 'google',
      encryptedKey: 'encrypted-google-key-placeholder',
      keyMetadata: {
        model: 'gemini-pro',
        region: 'us-central1',
      },
      isActive: true,
    },
  ],
};

/**
 * Hash password using bcrypt
 */
async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Generate API key hash
 */
function generateApiKeyHash(apiKey: string): string {
  return bcrypt.hashSync(apiKey, SALT_ROUNDS);
}

/**
 * Check if data already exists
 */
async function checkExistingData(): Promise<{
  organizationExists: boolean;
  usersExist: boolean;
  apiKeysExist: boolean;
}> {
  const organizationCount = await prisma.organization.count({
    where: { id: DEFAULT_DATA.organization.id },
  });

  const userCount = await prisma.user.count({
    where: { organizationId: DEFAULT_DATA.organization.id },
  });

  const apiKeyCount = await prisma.apiKey.count({
    where: { organizationId: DEFAULT_DATA.organization.id },
  });

  return {
    organizationExists: organizationCount > 0,
    usersExist: userCount > 0,
    apiKeysExist: apiKeyCount > 0,
  };
}

/**
 * Create default organization
 */
async function createOrganization(): Promise<void> {
  log.step('Creating default organization...');

  try {
    await prisma.organization.upsert({
      where: { id: DEFAULT_DATA.organization.id },
      update: {
        name: DEFAULT_DATA.organization.name,
        deploymentMode: DEFAULT_DATA.organization.deploymentMode,
        licenseTier: DEFAULT_DATA.organization.licenseTier,
        isActive: DEFAULT_DATA.organization.isActive,
        updatedAt: new Date(),
      },
      create: {
        id: DEFAULT_DATA.organization.id,
        name: DEFAULT_DATA.organization.name,
        deploymentMode: DEFAULT_DATA.organization.deploymentMode,
        licenseTier: DEFAULT_DATA.organization.licenseTier,
        isActive: DEFAULT_DATA.organization.isActive,
      },
    });

    log.success('Default organization created/updated');
  } catch (error) {
    log.error(`Failed to create organization: ${error}`);
    throw error;
  }
}

/**
 * Create default users
 */
async function createUsers(): Promise<void> {
  log.step('Creating default users...');

  for (const userData of DEFAULT_DATA.users) {
    try {
      const hashedPassword = await hashPassword(userData.password);

      await prisma.user.upsert({
        where: {
          organizationId_email: {
            organizationId: DEFAULT_DATA.organization.id,
            email: userData.email,
          },
        },
        update: {
          name: userData.name,
          role: userData.role,
          passwordHash: hashedPassword,
          isActive: userData.isActive,
          updatedAt: new Date(),
        },
        create: {
          id: userData.id,
          organizationId: DEFAULT_DATA.organization.id,
          email: userData.email,
          name: userData.name,
          role: userData.role,
          passwordHash: hashedPassword,
          isActive: userData.isActive,
        },
      });

      log.success(`User created/updated: ${userData.email} (${userData.role})`);
    } catch (error) {
      log.error(`Failed to create user ${userData.email}: ${error}`);
      throw error;
    }
  }
}

/**
 * Create default API keys
 */
async function createApiKeys(): Promise<void> {
  log.step('Creating default API keys...');

  for (const apiKeyData of DEFAULT_DATA.apiKeys) {
    try {
      const keyHash = generateApiKeyHash(apiKeyData.key);

      await prisma.apiKey.upsert({
        where: { id: apiKeyData.id },
        update: {
          name: apiKeyData.name,
          keyHash: keyHash,
          rateLimitPerMinute: apiKeyData.rateLimitPerMinute,
          expiresAt: apiKeyData.expiresAt,
          isActive: apiKeyData.isActive,
          updatedAt: new Date(),
        },
        create: {
          id: apiKeyData.id,
          organizationId: DEFAULT_DATA.organization.id,
          name: apiKeyData.name,
          keyHash: keyHash,
          rateLimitPerMinute: apiKeyData.rateLimitPerMinute,
          expiresAt: apiKeyData.expiresAt,
          isActive: apiKeyData.isActive,
          createdBy: 'admin-user-123',
        },
      });

      log.success(
        `API key created/updated: ${apiKeyData.name} (${apiKeyData.key})`
      );
    } catch (error) {
      log.error(`Failed to create API key ${apiKeyData.name}: ${error}`);
      throw error;
    }
  }
}

/**
 * Create provider keys
 */
async function createProviderKeys(): Promise<void> {
  log.step('Creating provider keys...');

  for (const providerKeyData of DEFAULT_DATA.providerKeys) {
    try {
      await prisma.providerKey.upsert({
        where: {
          organizationId_provider: {
            organizationId: DEFAULT_DATA.organization.id,
            provider: providerKeyData.provider,
          },
        },
        update: {
          encryptedKey: providerKeyData.encryptedKey,
          keyMetadata: providerKeyData.keyMetadata,
          isActive: providerKeyData.isActive,
          updatedAt: new Date(),
        },
        create: {
          organizationId: DEFAULT_DATA.organization.id,
          provider: providerKeyData.provider,
          encryptedKey: providerKeyData.encryptedKey,
          keyMetadata: providerKeyData.keyMetadata,
          isActive: providerKeyData.isActive,
        },
      });

      log.success(`Provider key created/updated: ${providerKeyData.provider}`);
    } catch (error) {
      log.error(
        `Failed to create provider key ${providerKeyData.provider}: ${error}`
      );
      throw error;
    }
  }
}

/**
 * Create sample usage events
 */
async function createSampleUsageEvents(): Promise<void> {
  log.step('Creating sample usage events...');

  const sampleEvents = [
    {
      organizationId: DEFAULT_DATA.organization.id,
      apiKeyId: 'default-api-key-123',
      userId: 'admin-user-123',
      provider: 'openai',
      model: 'gpt-4',
      tokensInput: 150,
      tokensOutput: 200,
      cost: 0.012,
      latencyMs: 1200,
      status: 'success',
      dataSanitized: true,
      sanitizationCount: 2,
      requestId: `req-${uuidv4()}`,
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      metadata: {
        userAgent: 'Node2AI-SDK/1.0.0',
        ipAddress: '127.0.0.1',
        sanitizationRules: ['pii', 'phi'],
      },
    },
    {
      organizationId: DEFAULT_DATA.organization.id,
      apiKeyId: 'developer-api-key-456',
      userId: 'developer-user-456',
      provider: 'anthropic',
      model: 'claude-3-sonnet',
      tokensInput: 200,
      tokensOutput: 180,
      cost: 0.008,
      latencyMs: 950,
      status: 'success',
      dataSanitized: true,
      sanitizationCount: 1,
      requestId: `req-${uuidv4()}`,
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      metadata: {
        userAgent: 'Node2AI-SDK/1.0.0',
        ipAddress: '127.0.0.1',
        sanitizationRules: ['pii'],
      },
    },
    {
      organizationId: DEFAULT_DATA.organization.id,
      apiKeyId: 'viewer-api-key-789',
      userId: 'viewer-user-789',
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      tokensInput: 100,
      tokensOutput: 120,
      cost: 0.003,
      latencyMs: 800,
      status: 'success',
      dataSanitized: false,
      sanitizationCount: 0,
      requestId: `req-${uuidv4()}`,
      timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
      metadata: {
        userAgent: 'Node2AI-SDK/1.0.0',
        ipAddress: '127.0.0.1',
        sanitizationRules: [],
      },
    },
  ];

  for (const event of sampleEvents) {
    try {
      await prisma.usageEvent.create({
        data: event,
      });
    } catch (error) {
      log.warning(`Failed to create sample usage event: ${error}`);
    }
  }

  log.success('Sample usage events created');
}

/**
 * Create sample audit logs
 */
async function createSampleAuditLogs(): Promise<void> {
  log.step('Creating sample audit logs...');

  const sampleLogs = [
    {
      organizationId: DEFAULT_DATA.organization.id,
      userId: 'admin-user-123',
      action: 'login_success',
      resourceType: 'user',
      resourceId: 'admin-user-123',
      details: {
        email: 'admin@node2.ai',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      severity: 'info',
      timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
    },
    {
      organizationId: DEFAULT_DATA.organization.id,
      userId: 'admin-user-123',
      action: 'api_key_created',
      resourceType: 'api_key',
      resourceId: 'default-api-key-123',
      details: {
        name: 'Default API Key',
        scopes: ['read', 'write'],
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Node2AI-Web/1.0.0',
      severity: 'info',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    },
    {
      organizationId: DEFAULT_DATA.organization.id,
      userId: 'developer-user-456',
      action: 'data_sanitized',
      resourceType: 'sanitization',
      resourceId: null,
      details: {
        inputLength: 500,
        outputLength: 450,
        rulesApplied: ['pii', 'phi'],
        confidence: 0.95,
      },
      ipAddress: '127.0.0.1',
      userAgent: 'Node2AI-SDK/1.0.0',
      severity: 'info',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    },
  ];

  for (const log of sampleLogs) {
    try {
      await prisma.auditLog.create({
        data: log,
      });
    } catch (error) {
      log.warning(`Failed to create sample audit log: ${error}`);
    }
  }

  log.success('Sample audit logs created');
}

/**
 * Verify seeded data
 */
async function verifySeededData(): Promise<void> {
  log.step('Verifying seeded data...');

  const orgCount = await prisma.organization.count({
    where: { id: DEFAULT_DATA.organization.id },
  });

  const userCount = await prisma.user.count({
    where: { organizationId: DEFAULT_DATA.organization.id },
  });

  const apiKeyCount = await prisma.apiKey.count({
    where: { organizationId: DEFAULT_DATA.organization.id },
  });

  const usageEventCount = await prisma.usageEvent.count({
    where: { organizationId: DEFAULT_DATA.organization.id },
  });

  const auditLogCount = await prisma.auditLog.count({
    where: { organizationId: DEFAULT_DATA.organization.id },
  });

  log.info(`Verification results:`);
  log.info(`  Organizations: ${orgCount}`);
  log.info(`  Users: ${userCount}`);
  log.info(`  API Keys: ${apiKeyCount}`);
  log.info(`  Usage Events: ${usageEventCount}`);
  log.info(`  Audit Logs: ${auditLogCount}`);

  if (orgCount === 1 && userCount >= 4 && apiKeyCount >= 3) {
    log.success('Data verification passed');
  } else {
    log.error('Data verification failed');
    throw new Error('Verification failed');
  }
}

/**
 * Display seeded data summary
 */
function displaySummary(): void {
  log.success('Node2AI seed data creation completed!');
  console.log();
  log.info('Default credentials:');
  console.log('  Organization: default-org');
  console.log('  Admin User: admin@node2.ai / admin123');
  console.log('  Developer User: developer@node2.ai / dev123');
  console.log('  Viewer User: viewer@node2.ai / view123');
  console.log('  Auditor User: auditor@node2.ai / audit123');
  console.log();
  log.info('API Keys:');
  console.log('  Default: test-api-key-123');
  console.log('  Developer: dev-api-key-456');
  console.log('  Viewer: view-api-key-789');
  console.log();
  log.info('Provider Keys:');
  console.log('  OpenAI: encrypted-openai-key-placeholder');
  console.log('  Anthropic: encrypted-anthropic-key-placeholder');
  console.log('  Google: encrypted-google-key-placeholder');
  console.log();
  log.info('Sample data includes:');
  console.log('  - Usage events for analytics');
  console.log('  - Audit logs for compliance');
  console.log('  - Token mappings for sanitization');
}

/**
 * Main seed function
 */
async function seedData(): Promise<void> {
  try {
    log.info('Starting Node2AI seed data creation...');

    // Check if data already exists
    const existingData = await checkExistingData();

    if (
      SKIP_IF_EXISTS &&
      (existingData.organizationExists || existingData.usersExist)
    ) {
      log.warning(
        'Data already exists and --skip-if-exists flag is set. Skipping...'
      );
      return;
    }

    if (existingData.organizationExists || existingData.usersExist) {
      log.warning(
        'Some data already exists. This will update existing records.'
      );
    }

    // Create data
    await createOrganization();
    await createUsers();
    await createApiKeys();
    await createProviderKeys();
    await createSampleUsageEvents();
    await createSampleAuditLogs();

    // Verify and display results
    await verifySeededData();
    displaySummary();
  } catch (error) {
    log.error(`Seed data creation failed: ${error}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Clean up existing data (for development)
 */
async function cleanData(): Promise<void> {
  try {
    log.warning('Cleaning existing seed data...');

    await prisma.usageEvent.deleteMany({
      where: { organizationId: DEFAULT_DATA.organization.id },
    });

    await prisma.auditLog.deleteMany({
      where: { organizationId: DEFAULT_DATA.organization.id },
    });

    await prisma.apiKey.deleteMany({
      where: { organizationId: DEFAULT_DATA.organization.id },
    });

    await prisma.providerKey.deleteMany({
      where: { organizationId: DEFAULT_DATA.organization.id },
    });

    await prisma.user.deleteMany({
      where: { organizationId: DEFAULT_DATA.organization.id },
    });

    await prisma.organization.deleteMany({
      where: { id: DEFAULT_DATA.organization.id },
    });

    log.success('Data cleaned successfully');
  } catch (error) {
    log.error(`Data cleanup failed: ${error}`);
    throw error;
  }
}

// Main execution
async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'clean':
      await cleanData();
      break;
    case 'seed':
    default:
      await seedData();
      break;
  }
}

// Handle uncaught errors
process.on('unhandledRejection', error => {
  log.error(`Unhandled rejection: ${error}`);
  process.exit(1);
});

process.on('uncaughtException', error => {
  log.error(`Uncaught exception: ${error}`);
  process.exit(1);
});

// Run main function
main().catch(error => {
  log.error(`Script failed: ${error}`);
  process.exit(1);
});
