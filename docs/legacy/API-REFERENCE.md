# Node2AI API Reference

This document provides comprehensive API reference for Node2AI Enterprise Platform.

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
- [Data Models](#data-models)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [SDK Examples](#sdk-examples)

## Authentication

### API Key Authentication

```bash
# Add API key to headers
curl -H "X-API-Key: your-api-key" \
     -H "Content-Type: application/json" \
     https://api.supernova.ai/v1/health
```

### JWT Token Authentication

```bash
# Login to get token
curl -X POST https://api.supernova.ai/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email": "user@example.com", "password": "password"}'

# Use token in subsequent requests
curl -H "Authorization: Bearer your-jwt-token" \
     -H "Content-Type: application/json" \
     https://api.supernova.ai/v1/users
```

## Endpoints

### Authentication Endpoints

#### POST /auth/login

Authenticate user and get access token.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "password",
  "rememberMe": false
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "role": "admin",
      "permissions": [
        {
          "resource": "users",
          "actions": ["read", "write", "delete"]
        }
      ],
      "tenantId": null,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "lastLoginAt": "2024-01-01T00:00:00Z",
      "isActive": true
    },
    "token": "jwt-token",
    "refreshToken": "refresh-token",
    "expiresIn": 3600
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### POST /auth/logout

Logout user and invalidate token.

**Request:**

```json
{
  "refreshToken": "refresh-token"
}
```

**Response:**

```json
{
  "success": true,
  "message": "Logged out successfully",
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### POST /auth/refresh

Refresh access token.

**Request:**

```json
{
  "refreshToken": "refresh-token"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "new-jwt-token",
    "refreshToken": "new-refresh-token",
    "expiresIn": 3600
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### GET /auth/profile

Get current user profile.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "admin",
    "permissions": [
      {
        "resource": "users",
        "actions": ["read", "write", "delete"]
      }
    ],
    "tenantId": null,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "lastLoginAt": "2024-01-01T00:00:00Z",
    "isActive": true
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

### User Management Endpoints

#### GET /users

List users with pagination and filtering.

**Query Parameters:**

- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 10)
- `search` (string): Search term
- `role` (string): Filter by role
- `isActive` (boolean): Filter by active status

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "User Name",
      "role": "admin",
      "permissions": [
        {
          "resource": "users",
          "actions": ["read", "write", "delete"]
        }
      ],
      "tenantId": null,
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "lastLoginAt": "2024-01-01T00:00:00Z",
      "isActive": true
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 100,
    "totalPages": 10
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### POST /users

Create a new user.

**Request:**

```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "role": "operator",
  "permissions": [
    {
      "resource": "users",
      "actions": ["read", "write"]
    }
  ],
  "tenantId": "tenant-uuid"
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "newuser@example.com",
    "name": "New User",
    "role": "operator",
    "permissions": [
      {
        "resource": "users",
        "actions": ["read", "write"]
      }
    ],
    "tenantId": "tenant-uuid",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "lastLoginAt": null,
    "isActive": true
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### GET /users/:id

Get user by ID.

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "User Name",
    "role": "admin",
    "permissions": [
      {
        "resource": "users",
        "actions": ["read", "write", "delete"]
      }
    ],
    "tenantId": null,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "lastLoginAt": "2024-01-01T00:00:00Z",
    "isActive": true
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### PUT /users/:id

Update user.

**Request:**

```json
{
  "name": "Updated Name",
  "role": "operator",
  "permissions": [
    {
      "resource": "users",
      "actions": ["read", "write"]
    }
  ],
  "isActive": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "Updated Name",
    "role": "operator",
    "permissions": [
      {
        "resource": "users",
        "actions": ["read", "write"]
      }
    ],
    "tenantId": null,
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "lastLoginAt": "2024-01-01T00:00:00Z",
    "isActive": true
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### DELETE /users/:id

Delete user.

**Response:**

```json
{
  "success": true,
  "message": "User deleted successfully",
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

### Data Sanitization Endpoints

#### POST /sanitization/sanitize

Sanitize sensitive data.

**Request:**

```json
{
  "input": "Patient: John Doe\nSSN: 123-45-6789\nEmail: john@example.com",
  "options": {
    "categories": ["pii", "phi", "financial"],
    "severity": ["high", "critical"],
    "strictMode": true,
    "preserveFormat": true,
    "customRules": ["rule1", "rule2"]
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "original": "Patient: John Doe\nSSN: 123-45-6789\nEmail: john@example.com",
    "sanitized": "Patient: John Doe\nSSN: [SSN-REDACTED]\nEmail: [EMAIL-REDACTED]",
    "rulesApplied": [
      {
        "ruleId": "ssn-rule",
        "ruleName": "SSN Detection",
        "category": "pii",
        "severity": "critical",
        "matches": 1
      },
      {
        "ruleId": "email-rule",
        "ruleName": "Email Detection",
        "category": "pii",
        "severity": "high",
        "matches": 1
      }
    ],
    "confidence": 0.95,
    "warnings": [],
    "metadata": {
      "processingTime": 150,
      "totalMatches": 2,
      "categoriesFound": ["pii"],
      "severityLevels": ["high", "critical"],
      "riskScore": 85
    }
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### GET /sanitization/rules

List sanitization rules.

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Items per page
- `category` (string): Filter by category
- `severity` (string): Filter by severity
- `isActive` (boolean): Filter by active status

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "rule-uuid",
      "name": "SSN Detection",
      "description": "Detects Social Security Numbers",
      "pattern": "\\b\\d{3}-\\d{2}-\\d{4}\\b",
      "replacement": "[SSN-REDACTED]",
      "category": "pii",
      "severity": "critical",
      "isActive": true,
      "priority": 1,
      "tags": ["ssn", "pii"],
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z",
      "createdBy": "admin"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 50,
    "totalPages": 5
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### POST /sanitization/rules

Create sanitization rule.

**Request:**

```json
{
  "name": "Custom Rule",
  "description": "Custom sanitization rule",
  "pattern": "\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b",
  "replacement": "[CARD-REDACTED]",
  "category": "financial",
  "severity": "critical",
  "priority": 1,
  "tags": ["credit-card", "financial"]
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "rule-uuid",
    "name": "Custom Rule",
    "description": "Custom sanitization rule",
    "pattern": "\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b",
    "replacement": "[CARD-REDACTED]",
    "category": "financial",
    "severity": "critical",
    "isActive": true,
    "priority": 1,
    "tags": ["credit-card", "financial"],
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z",
    "createdBy": "admin"
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

### AI Model Endpoints

#### GET /models

List AI models.

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Items per page
- `provider` (string): Filter by provider
- `capability` (string): Filter by capability
- `isActive` (boolean): Filter by active status

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "model-uuid",
      "name": "GPT-4",
      "provider": "openai",
      "model": "gpt-4",
      "version": "1.0",
      "capabilities": ["text-generation", "chat"],
      "isActive": true,
      "config": {
        "maxTokens": 4096,
        "temperature": 0.7,
        "topP": 0.9
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### POST /models

Create AI model.

**Request:**

```json
{
  "name": "Custom Model",
  "provider": "openai",
  "model": "gpt-3.5-turbo",
  "version": "1.0",
  "capabilities": ["text-generation", "chat"],
  "config": {
    "maxTokens": 2048,
    "temperature": 0.7,
    "topP": 0.9
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "model-uuid",
    "name": "Custom Model",
    "provider": "openai",
    "model": "gpt-3.5-turbo",
    "version": "1.0",
    "capabilities": ["text-generation", "chat"],
    "isActive": true,
    "config": {
      "maxTokens": 2048,
      "temperature": 0.7,
      "topP": 0.9
    }
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### POST /models/:id/test

Test AI model.

**Request:**

```json
{
  "input": "Hello, world!",
  "options": {
    "temperature": 0.7,
    "maxTokens": 100
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "output": "Hello! How can I help you today?",
    "processingTime": 1250,
    "tokensUsed": 15,
    "cost": 0.0003
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

### Compliance Endpoints

#### GET /compliance/reports

List compliance reports.

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Items per page
- `type` (string): Filter by report type
- `status` (string): Filter by status
- `startDate` (string): Filter by start date
- `endDate` (string): Filter by end date

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "report-uuid",
      "type": "hipaa",
      "period": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-01-31T23:59:59Z"
      },
      "status": "completed",
      "findings": [
        {
          "id": "finding-uuid",
          "type": "data_access",
          "severity": "medium",
          "description": "Unauthorized data access detected",
          "affectedRecords": 5,
          "recommendation": "Review access controls"
        }
      ],
      "recommendations": [
        "Implement additional access controls",
        "Review user permissions"
      ],
      "generatedAt": "2024-01-31T23:59:59Z",
      "generatedBy": "admin"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "totalPages": 3
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### POST /compliance/reports

Generate compliance report.

**Request:**

```json
{
  "type": "hipaa",
  "period": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-31T23:59:59Z"
  },
  "includeAuditLogs": true,
  "includeFindings": true
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "id": "report-uuid",
    "type": "hipaa",
    "period": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z"
    },
    "status": "generating",
    "findings": [],
    "recommendations": [],
    "generatedAt": "2024-01-01T00:00:00Z",
    "generatedBy": "admin"
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### GET /compliance/audit-logs

Get audit logs.

**Query Parameters:**

- `page` (number): Page number
- `limit` (number): Items per page
- `userId` (string): Filter by user ID
- `action` (string): Filter by action
- `resource` (string): Filter by resource
- `severity` (string): Filter by severity
- `startDate` (string): Filter by start date
- `endDate` (string): Filter by end date

**Response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "log-uuid",
      "userId": "user-uuid",
      "action": "login",
      "resource": "auth",
      "resourceId": null,
      "details": {
        "ipAddress": "192.168.1.100",
        "userAgent": "Mozilla/5.0..."
      },
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0...",
      "timestamp": "2024-01-01T00:00:00Z",
      "severity": "info"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "total": 1000,
    "totalPages": 100
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

### Health and Monitoring Endpoints

#### GET /health

Health check endpoint.

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "checks": [
      {
        "name": "api",
        "status": "pass",
        "message": "API server is running",
        "duration": 5
      },
      {
        "name": "database",
        "status": "pass",
        "message": "Database connection healthy",
        "duration": 10
      },
      {
        "name": "redis",
        "status": "pass",
        "message": "Redis connection healthy",
        "duration": 3
      }
    ],
    "lastChecked": "2024-01-01T00:00:00Z"
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

#### GET /metrics

System metrics endpoint.

**Response:**

```json
{
  "success": true,
  "data": {
    "requests": {
      "total": 10000,
      "successful": 9500,
      "failed": 500,
      "averageResponseTime": 150
    },
    "sanitization": {
      "totalProcessed": 50000,
      "averageProcessingTime": 75,
      "rulesApplied": 250000
    },
    "compliance": {
      "reportsGenerated": 25,
      "findingsDetected": 150,
      "auditLogsCreated": 10000
    }
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

## Data Models

### User Model

```typescript
interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'viewer' | 'auditor';
  permissions: Permission[];
  tenantId?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  isActive: boolean;
}

interface Permission {
  resource: string;
  actions: string[];
}
```

### Sanitization Rule Model

```typescript
interface SanitizationRule {
  id: string;
  name: string;
  description?: string;
  pattern: string;
  replacement: string;
  category: 'pii' | 'phi' | 'financial' | 'government' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  isActive: boolean;
  priority: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
```

### AI Model Model

```typescript
interface AIModel {
  id: string;
  name: string;
  provider: 'openai' | 'anthropic' | 'local' | 'custom';
  model: string;
  version: string;
  capabilities: string[];
  isActive: boolean;
  config: {
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
    stopSequences?: string[];
  };
}
```

### Compliance Report Model

```typescript
interface ComplianceReport {
  id: string;
  type: 'gdpr' | 'hipaa' | 'sox' | 'custom';
  period: {
    start: string;
    end: string;
  };
  status: 'pending' | 'generating' | 'completed' | 'failed';
  findings: ComplianceFinding[];
  recommendations: string[];
  generatedAt: string;
  generatedBy: string;
}

interface ComplianceFinding {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  affectedRecords: number;
  recommendation: string;
}
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {
    "field": "Additional error details"
  },
  "timestamp": "2024-01-01T00:00:00Z",
  "requestId": "req_123456789"
}
```

### HTTP Status Codes

| Code | Description           |
| ---- | --------------------- |
| 200  | OK                    |
| 201  | Created               |
| 400  | Bad Request           |
| 401  | Unauthorized          |
| 403  | Forbidden             |
| 404  | Not Found             |
| 422  | Unprocessable Entity  |
| 429  | Too Many Requests     |
| 500  | Internal Server Error |

### Error Codes

| Code                   | Description              |
| ---------------------- | ------------------------ |
| `VALIDATION_ERROR`     | Input validation failed  |
| `AUTHENTICATION_ERROR` | Authentication failed    |
| `AUTHORIZATION_ERROR`  | Insufficient permissions |
| `NOT_FOUND_ERROR`      | Resource not found       |
| `CONFLICT_ERROR`       | Resource conflict        |
| `RATE_LIMIT_ERROR`     | Rate limit exceeded      |
| `INTERNAL_ERROR`       | Internal server error    |

## Rate Limiting

### Rate Limit Headers

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200
```

### Rate Limit Configuration

| Endpoint          | Limit         | Window     |
| ----------------- | ------------- | ---------- |
| `/auth/*`         | 5 requests    | 15 minutes |
| `/api/*`          | 1000 requests | 15 minutes |
| `/sanitization/*` | 100 requests  | 1 minute   |

## SDK Examples

### JavaScript/TypeScript

```typescript
import { createClient } from '@supernova/sdk';

const client = createClient({
  baseUrl: 'https://api.supernova.ai',
  apiKey: 'your-api-key',
});

// Authenticate
const authResponse = await client.auth.login({
  email: 'user@example.com',
  password: 'password',
});

// Sanitize data
const result = await client.sanitization.sanitize(
  `
  Patient: John Doe
  SSN: 123-45-6789
  Email: john@example.com
`,
  {
    categories: ['pii', 'phi'],
    severity: ['high', 'critical'],
    strictMode: true,
  }
);

console.log(result.sanitized);
```

### Python

```python
from supernova import SupernovaClient

client = SupernovaClient(
    base_url='https://api.supernova.ai',
    api_key='your-api-key'
)

# Authenticate
auth_response = client.auth.login(
    email='user@example.com',
    password='password'
)

# Sanitize data
result = client.sanitization.sanitize(
    input_text="""
    Patient: John Doe
    SSN: 123-45-6789
    Email: john@example.com
    """,
    options={
        'categories': ['pii', 'phi'],
        'severity': ['high', 'critical'],
        'strictMode': True
    }
)

print(result.sanitized)
```

### cURL Examples

```bash
# Login
curl -X POST https://api.supernova.ai/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password"}'

# Sanitize data
curl -X POST https://api.supernova.ai/v1/sanitization/sanitize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-jwt-token" \
  -d '{
    "input": "Patient: John Doe\nSSN: 123-45-6789",
    "options": {
      "categories": ["pii"],
      "severity": ["critical"],
      "strictMode": true
    }
  }'

# Get users
curl -X GET https://api.supernova.ai/v1/users \
  -H "Authorization: Bearer your-jwt-token" \
  -H "Content-Type: application/json"
```

## Webhooks

### Webhook Configuration

```json
{
  "url": "https://your-app.com/webhooks/supernova",
  "events": ["sanitization.completed", "compliance.report_generated"],
  "secret": "webhook-secret"
}
```

### Webhook Payload

```json
{
  "event": "sanitization.completed",
  "data": {
    "id": "request-uuid",
    "status": "completed",
    "result": {
      "original": "Patient: John Doe\nSSN: 123-45-6789",
      "sanitized": "Patient: John Doe\nSSN: [SSN-REDACTED]",
      "rulesApplied": 1,
      "confidence": 0.95
    }
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## Testing

### Postman Collection

Import the Node2AI Postman collection for easy API testing:

```json
{
  "info": {
    "name": "Node2AI API",
    "description": "Complete API collection for Node2AI",
    "version": "1.0.0"
  },
  "item": [
    {
      "name": "Authentication",
      "item": [
        {
          "name": "Login",
          "request": {
            "method": "POST",
            "url": "{{baseUrl}}/auth/login",
            "body": {
              "mode": "raw",
              "raw": "{\n  \"email\": \"user@example.com\",\n  \"password\": \"password\"\n}"
            }
          }
        }
      ]
    }
  ]
}
```

### API Testing

```bash
# Test health endpoint
curl -f https://api.supernova.ai/v1/health

# Test authentication
curl -X POST https://api.supernova.ai/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "password": "test123"}'

# Test sanitization
curl -X POST https://api.supernova.ai/v1/sanitization/sanitize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token" \
  -d '{"input": "Test data with SSN: 123-45-6789"}'
```
