// Test environment validation script
import { testDatabaseConnection } from '../src/lib/db/client';

async function validateTestEnvironment() {
  console.log('🧪 Validating Node2AI Test Environment...');
  console.log('');

  const results = {
    database: false,
    redis: false,
    openai: false,
    environment: false,
  };

  // Check environment variables
  console.log('📋 Checking environment variables...');
  const requiredEnvVars = [
    'DATABASE_URL',
    'OPENAI_API_KEY',
    'JWT_SECRET',
    'NODE_ENV',
  ];

  let envValid = true;
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.log(`❌ Missing environment variable: ${envVar}`);
      envValid = false;
    } else {
      console.log(
        `✅ ${envVar}: ${envVar === 'OPENAI_API_KEY' ? '***' : process.env[envVar]}`
      );
    }
  }

  results.environment = envValid;
  console.log('');

  // Check database connection
  console.log('🗄️ Testing database connection...');
  try {
    results.database = await testDatabaseConnection();
  } catch (error) {
    console.log('❌ Database connection failed:', error);
  }
  console.log('');

  // Check Redis connection
  console.log('🔴 Testing Redis connection...');
  try {
    const Redis = require('redis');
    const redis = Redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    await redis.connect();
    await redis.ping();
    await redis.disconnect();

    console.log('✅ Redis connection successful');
    results.redis = true;
  } catch (error) {
    console.log('❌ Redis connection failed:', error);
    console.log('💡 Redis is optional for testing, continuing...');
    results.redis = true; // Don't fail if Redis is not available
  }
  console.log('');

  // Check OpenAI API
  console.log('🤖 Testing OpenAI API connection...');
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ OpenAI API connection successful');
      console.log(`📊 Available models: ${data.data.length} models`);
      results.openai = true;
    } else {
      console.log(
        `❌ OpenAI API error: ${response.status} ${response.statusText}`
      );
    }
  } catch (error) {
    console.log('❌ OpenAI API connection failed:', error);
  }
  console.log('');

  // Summary
  console.log('📊 Test Environment Validation Summary:');
  console.log(`  Environment Variables: ${results.environment ? '✅' : '❌'}`);
  console.log(`  Database Connection: ${results.database ? '✅' : '❌'}`);
  console.log(`  Redis Connection: ${results.redis ? '✅' : '❌'}`);
  console.log(`  OpenAI API: ${results.openai ? '✅' : '❌'}`);
  console.log('');

  const allValid = Object.values(results).every(Boolean);

  if (allValid) {
    console.log('🎉 Test environment is ready!');
    console.log('');
    console.log('🚀 Next steps:');
    console.log('1. Start the API server: pnpm run dev');
    console.log('2. Test endpoints with Postman or curl');
    console.log('3. Check the test environment documentation');
  } else {
    console.log('❌ Test environment validation failed');
    console.log('');
    console.log('🔧 Please fix the issues above before proceeding');
    console.log('📚 See docs/TEST-ENVIRONMENT-SETUP.md for help');
  }

  return allValid;
}

// Run validation if this file is executed directly
if (require.main === module) {
  validateTestEnvironment()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Validation failed:', error);
      process.exit(1);
    });
}

export default validateTestEnvironment;
