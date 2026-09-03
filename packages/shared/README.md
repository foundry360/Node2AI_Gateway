# @supernova/shared

Shared types, utilities, and constants for Node2AI.

## Overview

This package contains all the shared code used across the Node2AI platform, including:

- **Types**: TypeScript interfaces and types for the entire platform
- **Utilities**: Common utility functions for data processing, validation, and formatting
- **Constants**: Application-wide constants and configuration values
- **Validation**: Zod schemas for runtime validation

## Features

- 🏗️ **Type Safety**: Comprehensive TypeScript types for all platform components
- 🔧 **Utilities**: Common functions for data sanitization, formatting, and processing
- ✅ **Validation**: Runtime validation schemas using Zod
- 📊 **Constants**: Centralized configuration and constant values
- 🔒 **Security**: Built-in data sanitization and masking utilities

## Installation

```bash
pnpm add @supernova/shared
```

## Usage

### Types

```typescript
import { User, SupernovaConfig, ApiResponse } from '@supernova/shared';

const user: User = {
  id: 'uuid',
  email: 'user@example.com',
  // ... other properties
};
```

### Utilities

```typescript
import {
  createApiResponse,
  sanitizeForLogging,
  maskSensitiveData,
} from '@supernova/shared';

// Create standardized API response
const response = createApiResponse(data, true, 'Success');

// Sanitize data for logging
const sanitized = sanitizeForLogging(sensitiveData);

// Mask sensitive fields in objects
const masked = maskSensitiveData(userData, ['password', 'ssn']);
```

### Validation

```typescript
import {
  validateConfig,
  validateUser,
  validateLicenseKey,
} from '@supernova/shared';

// Validate configuration
const config = validateConfig(userConfig);

// Validate user data
const user = validateUser(userData);

// Validate license key format
const isValid = validateLicenseKey('SN-1234-5678-9ABC-DEF0');
```

### Constants

```typescript
import { DEPLOYMENT_MODES, USER_ROLES, API_ENDPOINTS } from '@supernova/shared';

// Use deployment mode constants
if (config.deploymentMode === DEPLOYMENT_MODES.SELF_HOSTED) {
  // Handle self-hosted deployment
}

// Use API endpoint constants
const loginUrl = API_ENDPOINTS.AUTH.LOGIN;
```

## API Reference

### Types

- `SupernovaConfig`: Main configuration interface
- `User`: User data structure
- `AIModel`: AI model configuration
- `SanitizationRule`: Data sanitization rules
- `AuditLog`: Audit logging structure
- `ComplianceReport`: Compliance reporting structure

### Utilities

- `createApiResponse<T>()`: Create standardized API responses
- `createPaginatedResponse<T>()`: Create paginated API responses
- `sanitizeForLogging()`: Sanitize strings for logging
- `maskSensitiveData()`: Mask sensitive data in objects
- `generateRequestId()`: Generate unique request IDs
- `retryWithBackoff()`: Retry functions with exponential backoff

### Validation

- `validateConfig()`: Validate Node2AI configuration
- `validateUser()`: Validate user data
- `validateAIModel()`: Validate AI model configuration
- `validateLicenseKey()`: Validate license key format
- `validatePasswordStrength()`: Validate password strength

### Constants

- `DEPLOYMENT_MODES`: Available deployment modes
- `USER_ROLES`: User role types
- `MODEL_PROVIDERS`: AI model providers
- `SANITIZATION_CATEGORIES`: Data sanitization categories
- `API_ENDPOINTS`: API endpoint constants
- `ERROR_CODES`: Error code constants

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
pnpm test
```

### Linting

```bash
pnpm lint
```

### Type Checking

```bash
pnpm type-check
```

## License

Proprietary - Node2AI Enterprise License
