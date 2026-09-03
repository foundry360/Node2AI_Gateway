# @supernova/sdk

TypeScript SDK for Node2AI integration - provides client libraries for API, sanitization, and compliance features.

## Overview

The Node2AI SDK provides a comprehensive TypeScript client for integrating with the Node2AI platform. It offers:

- **Complete API Coverage**: All Node2AI endpoints and features
- **Type Safety**: Full TypeScript support with comprehensive types
- **Authentication**: Built-in token management and refresh
- **Error Handling**: Robust error handling with retry logic
- **Compliance**: Built-in compliance and audit features
- **Sanitization**: Data sanitization and privacy protection

## Installation

```bash
pnpm add @supernova/sdk
```

## Quick Start

### Basic Usage

```typescript
import { createClient } from '@supernova/sdk';

const client = createClient({
  baseUrl: 'https://your-supernova-instance.com',
  apiKey: 'your-api-key',
});

// Authenticate
await client.auth.login({
  email: 'user@example.com',
  password: 'password',
});

// Sanitize data
const result = await client.sanitization.sanitize(`
  Patient: John Doe
  SSN: 123-45-6789
  Email: john@example.com
`);

console.log(result.sanitized);
```

### Environment Configuration

```typescript
import { createClientFromEnv } from '@supernova/sdk';

// Uses environment variables:
// SUPERNOVA_BASE_URL
// SUPERNOVA_API_KEY
// SUPERNOVA_TIMEOUT
// SUPERNOVA_DEBUG
const client = createClientFromEnv();
```

## API Reference

### Client Configuration

```typescript
interface SupernovaClientConfig {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  retries?: number;
  debug?: boolean;
  version?: string;
}
```

### Authentication

```typescript
// Login
const authResponse = await client.auth.login({
  email: 'user@example.com',
  password: 'password',
});

// Get profile
const profile = await client.auth.getProfile();

// Change password
await client.auth.changePassword({
  currentPassword: 'old-password',
  newPassword: 'new-password',
});

// Logout
await client.auth.logout();
```

### Data Sanitization

```typescript
// Sanitize text
const result = await client.sanitization.sanitize(input, {
  categories: ['pii', 'phi', 'financial'],
  severity: ['high', 'critical'],
  strictMode: true,
});

// Manage sanitization rules
const rules = await client.sanitization.getRules();
const newRule = await client.sanitization.createRule({
  name: 'Custom Rule',
  pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
  replacement: '[SSN-REDACTED]',
  category: 'pii',
  severity: 'critical',
});

// Test rules
const testResult = await client.sanitization.testRule({
  pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b',
  replacement: '[SSN-REDACTED]',
  testInput: 'SSN: 123-45-6789',
});
```

### User Management

```typescript
// List users
const users = await client.users.list({
  page: 1,
  limit: 10,
  search: 'john',
});

// Create user
const newUser = await client.users.create({
  email: 'newuser@example.com',
  name: 'New User',
  role: 'operator',
});

// Update user
await client.users.update(userId, {
  name: 'Updated Name',
  role: 'admin',
});

// Manage permissions
const permissions = await client.users.getPermissions(userId);
await client.users.updatePermissions(userId, [
  { resource: 'users', actions: ['read', 'write'] },
]);
```

### AI Models

```typescript
// List models
const models = await client.models.list();

// Create model
const model = await client.models.create({
  name: 'GPT-4',
  provider: 'openai',
  model: 'gpt-4',
  version: '1.0',
  capabilities: ['text-generation', 'chat'],
});

// Test model
const testResult = await client.models.test(modelId, 'Hello, world!');
```

### Compliance

```typescript
// Generate compliance report
const report = await client.compliance.generateReport({
  type: 'hipaa',
  period: {
    start: '2024-01-01',
    end: '2024-01-31',
  },
});

// Get audit logs
const auditLogs = await client.compliance.getAuditLogs({
  userId: 'user-id',
  action: 'login',
  startDate: '2024-01-01',
  endDate: '2024-01-31',
});

// Export report
const pdfBlob = await client.compliance.exportReport(reportId, 'pdf');
```

### Health and Monitoring

```typescript
// Check health
const health = await client.health.check();

// Get metrics
const metrics = await client.health.getMetrics();

// Get version
const version = await client.health.getVersion();
```

## Advanced Features

### Retry Logic

```typescript
import { createClientWithRetry } from '@supernova/sdk';

const client = createClientWithRetry(config, 5); // 5 retries
```

### Batch Processing

```typescript
import { BatchProcessor } from '@supernova/sdk';

const processor = new BatchProcessor();

// Add operations
processor.add(() => client.sanitization.sanitize('text1'));
processor.add(() => client.sanitization.sanitize('text2'));

// Execute with concurrency limit
const results = await processor.execute(5);
```

### Rate Limiting

```typescript
import { RateLimiter } from '@supernova/sdk';

const limiter = new RateLimiter(10, 100); // 10 concurrent, 100ms delay

await limiter.execute(() => client.sanitization.sanitize(text));
```

### Caching

```typescript
import { ApiCache } from '@supernova/sdk';

const cache = new ApiCache();

// Cache API responses
cache.set('users', users, 300000); // 5 minutes
const cachedUsers = cache.get('users');
```

## Error Handling

```typescript
import {
  SupernovaSDKError,
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  NetworkError,
  RateLimitError,
} from '@supernova/sdk';

try {
  await client.auth.login(credentials);
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.log('Authentication failed');
  } else if (error instanceof NetworkError) {
    console.log('Network connection failed');
  } else if (error instanceof RateLimitError) {
    console.log('Rate limit exceeded, retry after:', error.details?.retryAfter);
  }
}
```

## TypeScript Support

The SDK provides comprehensive TypeScript support:

```typescript
import {
  SupernovaClient,
  User,
  AIModel,
  SanitizationResult,
  ComplianceReport,
} from '@supernova/sdk';

// Full type safety
const user: User = await client.users.get('user-id');
const result: SanitizationResult = await client.sanitization.sanitize(input);
```

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

### Documentation

```bash
pnpm docs
```

## License

Proprietary - Node2AI Enterprise License
