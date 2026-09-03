// Test data seeding script for Node2AI
// NOTE: This project now uses native PostgreSQL. Prisma integration is pending.
// This file is kept for backward compatibility and will be refactored to use pg/Prisma.
import bcrypt from 'bcryptjs';

async function seedTestData() {
  console.log('🌱 Seeding test data (STUB - migrate to native PostgreSQL)...');
  console.log(
    '⚠️  This file relies on Prisma which is not configured in production yet.'
  );
  console.log(
    'ℹ️  Use SQL migrations or the /api/v1/auth/register endpoint to seed data.'
  );
  return;

  /* DISABLED - REQUIRES UPDATED PRISMA CLIENT
  try {
    // Create test organization
    const testOrg = await prisma.organization.upsert({
      where: { id: 'test-org-1' },
      update: {},
      create: {
        id: 'test-org-1',
        name: 'Node2AI Test Organization',
        deploymentMode: 'self-hosted',
        licenseTier: 'enterprise',
        licenseKey: 'test-license-key-12345',
        licenseExpiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        maxInstances: 5,
        isActive: true,
      },
    });

    console.log('✅ Test organization created:', testOrg.name);

    // Create test users
    const hashedPassword = await bcrypt.hash('admin123', 10);

    const adminUser = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: testOrg.id,
          email: 'admin@node2ai.ai',
        },
      },
      update: {},
      create: {
        id: 'test-user-admin',
        organizationId: testOrg.id,
        email: 'admin@node2ai.ai',
        name: 'Admin User',
        role: 'admin',
        passwordHash: hashedPassword,
        isActive: true,
        lastLoginAt: new Date(),
      },
    });

    const testUser = await prisma.user.upsert({
      where: {
        organizationId_email: {
          organizationId: testOrg.id,
          email: 'test@node2ai.ai',
        },
      },
      update: {},
      create: {
        id: 'test-user-1',
        organizationId: testOrg.id,
        email: 'test@node2ai.ai',
        name: 'Test User',
        role: 'user',
        passwordHash: hashedPassword,
        isActive: true,
        lastLoginAt: new Date(),
      },
    });

    console.log('✅ Test users created:', adminUser.email, testUser.email);

    // Create test API keys
    const testApiKey = await prisma.apiKey.upsert({
      where: { keyHash: 'test-api-key-hash-12345' },
      update: {},
      create: {
        id: 'test-api-key-1',
        organizationId: testOrg.id,
        name: 'Test API Key',
        keyHash: 'test-api-key-hash-12345',
        rateLimitPerMinute: 1000,
        expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
        isActive: true,
        createdBy: adminUser.id,
      },
    });

    console.log('✅ Test API key created:', testApiKey.name);

    // Create test provider keys (encrypted)
    const testProviderKeys = [
      {
        id: 'test-provider-openai',
        provider: 'openai',
        encryptedKey: 'encrypted-openai-key-placeholder',
        keyMetadata: {
          model: 'gpt-4',
          region: 'us-east-1',
          environment: 'test',
          description: 'Test OpenAI API key',
        },
      },
      {
        id: 'test-provider-anthropic',
        provider: 'anthropic',
        encryptedKey: 'encrypted-anthropic-key-placeholder',
        keyMetadata: {
          model: 'claude-3-sonnet-20240229',
          region: 'us-west-2',
          environment: 'test',
          description: 'Test Anthropic API key',
        },
      },
    ];

    for (const keyData of testProviderKeys) {
      await prisma.providerKey.upsert({
        where: {
          organizationId_provider: {
            organizationId: testOrg.id,
            provider: keyData.provider,
          },
        },
        update: {},
        create: {
          id: keyData.id,
          organizationId: testOrg.id,
          provider: keyData.provider,
          encryptedKey: keyData.encryptedKey,
          keyMetadata: keyData.keyMetadata,
          isActive: true,
        },
      });
    }

    console.log('✅ Test provider keys created');

    // Create test usage events
    const testUsageEvents = [
      {
        id: 'test-usage-1',
        organizationId: testOrg.id,
        apiKeyId: testApiKey.id,
        userId: adminUser.id,
        provider: 'openai',
        model: 'gpt-4',
        tokensInput: 100,
        tokensOutput: 50,
        cost: 0.005,
        latencyMs: 1200,
        status: 'success',
        dataSanitized: true,
        sanitizationCount: 2,
        requestId: 'req-test-1',
        metadata: {
          endpoint: '/api/v1/chat/sanitized',
          sanitizationRules: ['pii', 'phi'],
        },
      },
      {
        id: 'test-usage-2',
        organizationId: testOrg.id,
        apiKeyId: testApiKey.id,
        userId: testUser.id,
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        tokensInput: 150,
        tokensOutput: 75,
        cost: 0.003,
        latencyMs: 800,
        status: 'success',
        dataSanitized: false,
        sanitizationCount: 0,
        requestId: 'req-test-2',
        metadata: {
          endpoint: '/api/v1/chat/simple',
        },
      },
    ];

    for (const eventData of testUsageEvents) {
      await prisma.usageEvent.create({
        data: eventData,
      });
    }

    console.log('✅ Test usage events created');

    // Create test audit logs
    const testAuditLogs = [
      {
        id: 'test-audit-1',
        organizationId: testOrg.id,
        userId: adminUser.id,
        action: 'LOGIN',
        resourceType: 'user',
        resourceId: adminUser.id,
        details: {
          loginMethod: 'password',
          ipAddress: '127.0.0.1',
          userAgent: 'Node2AI Test Client',
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Node2AI Test Client',
        severity: 'info',
      },
      {
        id: 'test-audit-2',
        organizationId: testOrg.id,
        userId: adminUser.id,
        action: 'CREATE',
        resourceType: 'api_key',
        resourceId: testApiKey.id,
        details: {
          keyName: testApiKey.name,
          rateLimit: testApiKey.rateLimitPerMinute,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'Node2AI Test Client',
        severity: 'info',
      },
    ];

    for (const logData of testAuditLogs) {
      await prisma.auditLog.create({
        data: logData,
      });
    }

    console.log('✅ Test audit logs created');

    console.log('🎉 Test data seeding completed successfully!');
    console.log('');
    console.log('📋 Test Data Summary:');
    console.log(`  Organization: ${testOrg.name} (${testOrg.id})`);
    console.log(`  Users: ${adminUser.email}, ${testUser.email}`);
    console.log(`  API Key: ${testApiKey.name}`);
    console.log(`  Provider Keys: ${testProviderKeys.length} keys`);
    console.log(`  Usage Events: ${testUsageEvents.length} events`);
    console.log(`  Audit Logs: ${testAuditLogs.length} logs`);
    console.log('');
    console.log('🔑 Test Credentials:');
    console.log('  Admin: admin@node2ai.ai / admin123');
    console.log('  User:  test@node2ai.ai / admin123');
    console.log('  API Key: test-api-key-hash-12345');
  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
  */
}

// Run the seeding if this file is executed directly
if (require.main === module) {
  seedTestData()
    .then(() => {
      console.log('✅ Seeding completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

export default seedTestData;
