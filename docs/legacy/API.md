# Node2AI API Documentation

## Overview

The Node2AI API provides programmatic access to the Node2AI platform, enabling you to integrate AI capabilities into your applications, manage provider keys, track usage analytics, and control costs across multiple AI providers.

**Base URL:** `https://api.yourdomain.com/api/v1`  
**Current Version:** v1  
**Response Format:** JSON  
**Authentication:** Required for all endpoints except `/health`  
**Rate Limiting:** 100 requests/minute per API key (configurable)  
**Support:** api-support@foundry360.com

### Key Features

- **Multi-Provider AI Access**: OpenAI, Anthropic, Google, Perplexity
- **Smart Routing**: Automatic provider selection and failover
- **Cost Management**: Real-time cost tracking and analytics
- **Security**: Enterprise-grade encryption and access controls
- **Scalability**: Built for high-volume production use
- **Compliance**: SOC 2, GDPR, HIPAA ready

## Getting Started

### Quick Start

```bash
# 1. Get your API key from Node2AI dashboard
# Navigate to Settings → API Keys → Create New Key

# 2. Test the API
curl https://api.yourdomain.com/api/health

# 3. Authenticate and make your first request
curl https://api.yourdomain.com/api/v1/user/profile \
  -H "X-API-Key: your-api-key-here"

# 4. Send a chat message
curl -X POST https://api.yourdomain.com/api/v1/chat \
  -H "X-API-Key: your-api-key-here" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, World!",
    "provider": "openai",
    "model": "gpt-4"
  }'
```

### API Endpoints Overview

| Category           | Endpoints                       | Description                     |
| ------------------ | ------------------------------- | ------------------------------- |
| **Authentication** | `/api/v1/auth/*`                | Login, logout, token management |
| **Provider Keys**  | `/api/v1/provider-keys/*`       | AI provider API key management  |
| **Chat**           | `/api/v1/chat/*`                | AI chat and completions         |
| **Analytics**      | `/api/v1/analytics/*`           | Usage statistics and reporting  |
| **Users**          | `/api/v1/users/*`               | User management                 |
| **Organizations**  | `/api/v1/organizations/*`       | Organization settings           |
| **API Keys**       | `/api/v1/api-keys/*`            | API key management              |
| **Health**         | `/api/health`, `/api/v1/status` | System health and status        |

## Authentication

Node2AI supports two authentication methods to accommodate different use cases:

### Method 1: JWT Token (User Authentication)

**Best for:** Web applications, user-facing features, temporary access

```bash
# Step 1: Login to get token
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "your-password"
  }'

# Response:
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "24h",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "admin",
      "organizationId": "org-uuid"
    }
  }
}

# Step 2: Use token in subsequent requests
curl https://api.yourdomain.com/api/v1/user/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### Method 2: API Key (Programmatic Access)

**Best for:** Server-to-server, automation, CI/CD, long-running processes

```bash
# Use API key directly (no login required)
curl https://api.yourdomain.com/api/v1/user/profile \
  -H "X-API-Key: node2ai-key-prod-abc123xyz"

# Or using Authorization header
curl https://api.yourdomain.com/api/v1/user/profile \
  -H "Authorization: ApiKey node2ai-key-prod-abc123xyz"
```

### Authentication Comparison

| Feature          | JWT Tokens               | API Keys                       |
| ---------------- | ------------------------ | ------------------------------ |
| **Expiration**   | 24 hours (configurable)  | No expiration (unless revoked) |
| **Refresh**      | Yes (refresh tokens)     | No (regenerate if needed)      |
| **User Context** | Full user information    | Limited user context           |
| **Revocation**   | Immediate (logout)       | Immediate (revoke)             |
| **Use Case**     | User sessions            | Service integration            |
| **Security**     | Short-lived, auto-expire | Long-lived, manual management  |

## Response Format

### Success Response Structure

```json
{
  "success": true,
  "data": {
    // Response payload here
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_abc123xyz",
    "version": "v1"
  }
}
```

### Error Response Structure

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "Additional context",
      "suggestion": "How to fix"
    }
  },
  "meta": {
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_abc123xyz",
    "version": "v1"
  }
}
```

### HTTP Status Codes

| Code                        | Description                             | Common Causes                                |
| --------------------------- | --------------------------------------- | -------------------------------------------- |
| `200 OK`                    | Request succeeded                       | Normal operation                             |
| `201 Created`               | Resource created successfully           | POST requests                                |
| `204 No Content`            | Request succeeded, no content to return | DELETE requests                              |
| `400 Bad Request`           | Invalid request parameters              | Malformed JSON, missing fields               |
| `401 Unauthorized`          | Missing or invalid authentication       | Invalid token/key, expired token             |
| `403 Forbidden`             | Authenticated but lacking permissions   | Insufficient role, resource access denied    |
| `404 Not Found`             | Resource doesn't exist                  | Invalid ID, deleted resource                 |
| `422 Unprocessable Entity`  | Validation failed                       | Invalid data format, business rule violation |
| `429 Too Many Requests`     | Rate limit exceeded                     | Too many requests, upgrade tier              |
| `500 Internal Server Error` | Server error                            | Database error, internal failure             |
| `502 Bad Gateway`           | Provider API error                      | AI provider down, invalid provider key       |
| `503 Service Unavailable`   | Temporary outage                        | Maintenance, overloaded service              |

## Rate Limiting

### Rate Limit Headers

Every API response includes rate limiting information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 75
X-RateLimit-Reset: 1705315800
X-RateLimit-Window: 60
```

### Rate Limit Tiers

| Role           | Requests/Minute | Requests/Hour | Requests/Day |
| -------------- | --------------- | ------------- | ------------ |
| **Viewer**     | 60              | 1,000         | 10,000       |
| **Developer**  | 100             | 5,000         | 50,000       |
| **Admin**      | 300             | 15,000        | 150,000      |
| **Enterprise** | Custom          | Custom        | Custom       |

### Handling Rate Limits

**JavaScript Example:**

```javascript
async function makeRequestWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const resetTime = response.headers.get('X-RateLimit-Reset');
      const waitTime = resetTime * 1000 - Date.now();

      console.log(`Rate limited. Waiting ${waitTime}ms...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }

    return response;
  }

  throw new Error('Max retries exceeded');
}
```

**Python Example:**

```python
import time
import requests

def make_request_with_retry(url, headers, max_retries=3):
    for i in range(max_retries):
        response = requests.get(url, headers=headers)

        if response.status_code == 429:
            reset_time = int(response.headers.get('X-RateLimit-Reset', 0))
            wait_time = (reset_time * 1000) - int(time.time() * 1000)

            print(f"Rate limited. Waiting {wait_time}ms...")
            time.sleep(wait_time / 1000)
            continue

        return response

    raise Exception('Max retries exceeded')
```

## API Endpoints - Complete Reference

### Authentication Endpoints

#### POST /api/v1/auth/login

Authenticate user and receive JWT token.

**Request:**

```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "24h",
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "admin",
      "organizationId": "org-uuid-here",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  }
}
```

**Error (401):**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

**cURL Example:**

```bash
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@node2ai.ai",
    "password": "admin123"
  }'
```

---

#### GET /api/v1/auth/validate

Validate current authentication token or API key.

**Headers:**

- `Authorization: Bearer {token}` OR
- `X-API-Key: {api-key}`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "valid": true,
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "email": "user@example.com",
      "role": "admin",
      "organizationId": "org-uuid"
    },
    "authMethod": "jwt",
    "expiresAt": "2024-01-16T10:30:00Z"
  }
}
```

**cURL Example:**

```bash
curl https://api.yourdomain.com/api/v1/auth/validate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

#### POST /api/v1/auth/logout

Invalidate current session and token.

**Headers:** `Authorization: Bearer {token}`

**Response (200):**

```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

#### POST /api/v1/auth/refresh

Refresh JWT token before expiration.

**Request:**

```json
{
  "refreshToken": "refresh_token_here"
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "token": "new_jwt_token",
    "expiresIn": "24h"
  }
}
```

---

### Provider Keys Endpoints

#### GET /api/v1/provider-keys

List all provider keys for your organization.

**Headers:** `X-API-Key: {api-key}`

**Query Parameters:**

- `provider`: Filter by provider (openai, anthropic, google, perplexity)
- `active`: Filter by active status (true/false)
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20, max: 100)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "keys": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "provider": "openai",
        "keyName": "Production OpenAI Key",
        "maskedKey": "sk-p...key",
        "isActive": true,
        "testStatus": "success",
        "lastTested": "2024-01-15T10:00:00Z",
        "lastUsed": "2024-01-15T10:25:00Z",
        "createdAt": "2024-01-01T00:00:00Z",
        "createdBy": "user-uuid",
        "metadata": {
          "model": "gpt-4",
          "environment": "production",
          "region": "us-east-1"
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5,
      "pages": 1
    }
  }
}
```

**cURL Example:**

```bash
curl "https://api.yourdomain.com/api/v1/provider-keys?provider=openai&active=true" \
  -H "X-API-Key: your-api-key"
```

---

#### POST /api/v1/provider-keys

Add new provider API key.

**Headers:**

- `X-API-Key: {api-key}`
- `Content-Type: application/json`

**Required Role:** admin, developer

**Request:**

```json
{
  "provider": "openai",
  "apiKey": "sk-proj-your-actual-key-here",
  "keyMetadata": {
    "keyName": "Production OpenAI Key",
    "model": "gpt-4",
    "environment": "production",
    "region": "us-east-1",
    "description": "Primary production key for GPT-4 requests"
  }
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "openai",
    "keyName": "Production OpenAI Key",
    "maskedKey": "sk-p...key",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

**cURL Example:**

```bash
curl -X POST https://api.yourdomain.com/api/v1/provider-keys \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "apiKey": "sk-proj-...",
    "keyMetadata": {
      "keyName": "Production Key",
      "model": "gpt-4",
      "environment": "production"
    }
  }'
```

---

#### GET /api/v1/provider-keys/:id

Get details of a specific provider key.

**Headers:** `X-API-Key: {api-key}`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "openai",
    "keyName": "Production OpenAI Key",
    "maskedKey": "sk-p...key",
    "isActive": true,
    "testStatus": "success",
    "testMessage": "Connection successful",
    "lastTested": "2024-01-15T10:00:00Z",
    "lastUsed": "2024-01-15T10:25:00Z",
    "usageStats": {
      "totalRequests": 1250,
      "totalTokens": 125000,
      "totalCost": 3.75,
      "last24h": {
        "requests": 150,
        "tokens": 15000,
        "cost": 0.45
      }
    },
    "createdAt": "2024-01-01T00:00:00Z",
    "metadata": {
      "model": "gpt-4",
      "environment": "production"
    }
  }
}
```

---

#### PUT /api/v1/provider-keys/:id

Update provider key metadata.

**Headers:**

- `X-API-Key: {api-key}`
- `Content-Type: application/json`

**Required Role:** admin, developer

**Request:**

```json
{
  "keyMetadata": {
    "keyName": "Updated Production Key",
    "description": "Now using GPT-4 Turbo"
  },
  "isActive": true
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "keyName": "Updated Production Key",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

#### DELETE /api/v1/provider-keys/:id

Delete provider key.

**Headers:** `X-API-Key: {api-key}`

**Required Role:** admin, developer

**Response (200):**

```json
{
  "success": true,
  "message": "Provider key deleted successfully"
}
```

**cURL Example:**

```bash
curl -X DELETE https://api.yourdomain.com/api/v1/provider-keys/550e8400-e29b-41d4-a716-446655440000 \
  -H "X-API-Key: your-api-key"
```

---

#### POST /api/v1/provider-keys/:id/test

Test provider key connection.

**Headers:** `X-API-Key: {api-key}`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "success",
    "message": "Connection successful",
    "latency": 245,
    "timestamp": "2024-01-15T10:30:00Z",
    "availableModels": ["gpt-4", "gpt-4-turbo-preview", "gpt-3.5-turbo"],
    "rateLimit": {
      "requestsPerMinute": 10000,
      "tokensPerMinute": 2000000
    }
  }
}
```

**Error (502):**

```json
{
  "success": false,
  "error": {
    "code": "PROVIDER_TEST_FAILED",
    "message": "Provider test failed: Invalid API key",
    "details": {
      "provider": "openai",
      "httpStatus": 401,
      "providerError": "Incorrect API key provided"
    }
  }
}
```

**cURL Example:**

```bash
curl -X POST https://api.yourdomain.com/api/v1/provider-keys/550e8400-e29b-41d4-a716-446655440000/test \
  -H "X-API-Key: your-api-key"
```

---

### Chat Endpoints

#### POST /api/v1/chat

Send a chat message to AI provider.

**Headers:**

- `X-API-Key: {api-key}`
- `Content-Type: application/json`

**Request:**

```json
{
  "message": "Explain quantum computing in simple terms",
  "provider": "openai",
  "model": "gpt-4",
  "stream": false,
  "options": {
    "maxTokens": 1000,
    "temperature": 0.7,
    "topP": 1.0,
    "frequencyPenalty": 0.0,
    "presencePenalty": 0.0,
    "systemPrompt": "You are a helpful assistant that explains complex topics simply."
  },
  "context": {
    "conversationId": "conv-uuid",
    "previousMessages": [
      {
        "role": "user",
        "content": "What is AI?"
      },
      {
        "role": "assistant",
        "content": "AI is artificial intelligence..."
      }
    ]
  },
  "sanitization": {
    "enabled": true,
    "detectPII": true,
    "maskSensitiveData": true
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "msg-550e8400-e29b-41d4-a716-446655440000",
    "conversationId": "conv-uuid",
    "provider": "openai",
    "model": "gpt-4",
    "message": "Quantum computing is like having a super-powerful calculator...",
    "usage": {
      "promptTokens": 45,
      "completionTokens": 156,
      "totalTokens": 201
    },
    "cost": {
      "amount": 0.00603,
      "currency": "USD"
    },
    "latency": 1250,
    "timestamp": "2024-01-15T10:30:00Z",
    "sanitization": {
      "applied": true,
      "detectionsCount": 0,
      "modifications": []
    }
  }
}
```

**cURL Example:**

```bash
curl -X POST https://api.yourdomain.com/api/v1/chat \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, World!",
    "provider": "openai",
    "model": "gpt-4",
    "options": {
      "maxTokens": 500,
      "temperature": 0.7
    }
  }'
```

---

#### POST /api/v1/chat/stream

Send a streaming chat message.

**Headers:**

- `X-API-Key: {api-key}`
- `Content-Type: application/json`

**Request:** Same as `/chat` with `stream: true`

**Response:** Server-Sent Events (SSE) stream

**Event Types:**

```
event: start
data: {"conversationId":"conv-uuid","model":"gpt-4"}

event: token
data: {"token":"Quantum","index":0}

event: token
data: {"token":" computing","index":1}

event: end
data: {"usage":{"totalTokens":201},"cost":0.00603}
```

**JavaScript Example:**

```javascript
const eventSource = new EventSource(
  'https://api.yourdomain.com/api/v1/chat/stream',
  {
    headers: {
      'X-API-Key': 'your-api-key',
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify({
      message: 'Explain quantum computing',
      provider: 'openai',
      model: 'gpt-4',
      stream: true,
    }),
  }
);

eventSource.addEventListener('token', e => {
  const data = JSON.parse(e.data);
  console.log(data.token);
});

eventSource.addEventListener('end', e => {
  const data = JSON.parse(e.data);
  console.log('Total tokens:', data.usage.totalTokens);
  eventSource.close();
});
```

---

#### GET /api/v1/conversations

List conversations for current user/organization.

**Headers:** `X-API-Key: {api-key}`

**Query Parameters:**

- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `sortBy`: Sort field (createdAt, updatedAt)
- `order`: Sort order (asc, desc)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "id": "conv-uuid",
        "title": "Quantum Computing Discussion",
        "messageCount": 5,
        "createdAt": "2024-01-15T10:00:00Z",
        "updatedAt": "2024-01-15T10:30:00Z",
        "lastMessage": {
          "role": "assistant",
          "preview": "Quantum computing is like..."
        }
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "pages": 3
    }
  }
}
```

---

#### GET /api/v1/conversations/:id

Get conversation details with message history.

**Headers:** `X-API-Key: {api-key}`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "conv-uuid",
    "title": "Quantum Computing Discussion",
    "messages": [
      {
        "id": "msg-1",
        "role": "user",
        "content": "What is quantum computing?",
        "timestamp": "2024-01-15T10:00:00Z"
      },
      {
        "id": "msg-2",
        "role": "assistant",
        "content": "Quantum computing is...",
        "provider": "openai",
        "model": "gpt-4",
        "timestamp": "2024-01-15T10:00:15Z"
      }
    ],
    "totalMessages": 5,
    "createdAt": "2024-01-15T10:00:00Z"
  }
}
```

---

### Analytics Endpoints

#### GET /api/v1/analytics/usage

Get usage statistics and analytics.

**Headers:** `X-API-Key: {api-key}`

**Query Parameters:**

- `startDate`: ISO date string (default: 30 days ago)
- `endDate`: ISO date string (default: now)
- `provider`: Filter by provider
- `groupBy`: Aggregation period (hour, day, week, month)
- `metrics`: Comma-separated list (requests, tokens, cost, latency)

**Response (200):**

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalRequests": 10250,
      "totalTokens": 2500000,
      "totalCost": 75.5,
      "avgLatency": 850,
      "period": {
        "start": "2024-01-01T00:00:00Z",
        "end": "2024-01-15T23:59:59Z"
      }
    },
    "byProvider": {
      "openai": {
        "requests": 6000,
        "tokens": 1500000,
        "cost": 45.0,
        "avgLatency": 750
      },
      "anthropic": {
        "requests": 3500,
        "tokens": 875000,
        "cost": 26.25,
        "avgLatency": 920
      },
      "google": {
        "requests": 750,
        "tokens": 125000,
        "cost": 4.25,
        "avgLatency": 650
      }
    },
    "byModel": {
      "gpt-4": {
        "requests": 4000,
        "tokens": 800000,
        "cost": 24.0
      },
      "gpt-3.5-turbo": {
        "requests": 2000,
        "tokens": 700000,
        "cost": 21.0
      }
    },
    "timeSeries": [
      {
        "date": "2024-01-01",
        "requests": 650,
        "tokens": 162500,
        "cost": 4.88
      },
      {
        "date": "2024-01-02",
        "requests": 720,
        "tokens": 180000,
        "cost": 5.4
      }
    ]
  }
}
```

**cURL Example:**

```bash
curl "https://api.yourdomain.com/api/v1/analytics/usage?startDate=2024-01-01&endDate=2024-01-15&groupBy=day" \
  -H "X-API-Key: your-api-key"
```

---

#### GET /api/v1/analytics/costs

Get detailed cost breakdown.

**Headers:** `X-API-Key: {api-key}`

**Query Parameters:**

- `startDate`: ISO date string
- `endDate`: ISO date string
- `groupBy`: day, week, month
- `breakdown`: provider, model, user

**Response (200):**

```json
{
  "success": true,
  "data": {
    "totalCost": 75.5,
    "currency": "USD",
    "period": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-15T23:59:59Z"
    },
    "breakdown": {
      "byProvider": {
        "openai": 45.0,
        "anthropic": 26.25,
        "google": 4.25
      },
      "byModel": {
        "gpt-4": 24.0,
        "gpt-3.5-turbo": 21.0,
        "claude-3-sonnet": 20.0,
        "claude-3-haiku": 6.25,
        "gemini-pro": 4.25
      },
      "byUser": {
        "user-1": 35.25,
        "user-2": 22.5,
        "user-3": 17.75
      }
    },
    "trend": {
      "previousPeriod": 62.3,
      "change": 13.2,
      "percentChange": 21.2
    },
    "projections": {
      "daily": 5.03,
      "monthly": 151.0
    }
  }
}
```

---

#### GET /api/v1/analytics/models

Get model usage statistics.

**Headers:** `X-API-Key: {api-key}`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "models": [
      {
        "provider": "openai",
        "model": "gpt-4",
        "requests": 4000,
        "tokens": 800000,
        "cost": 24.0,
        "avgLatency": 1200,
        "successRate": 99.5,
        "popularHours": [9, 10, 11, 14, 15, 16]
      },
      {
        "provider": "anthropic",
        "model": "claude-3-sonnet",
        "requests": 2500,
        "tokens": 625000,
        "cost": 20.0,
        "avgLatency": 950,
        "successRate": 99.8,
        "popularHours": [10, 11, 13, 14, 15]
      }
    ]
  }
}
```

---

### User Management Endpoints

#### GET /api/v1/users

List users in organization.

**Headers:** `X-API-Key: {api-key}`

**Required Role:** admin

**Query Parameters:**

- `role`: Filter by role
- `active`: Filter by active status
- `page`: Page number
- `limit`: Items per page

**Response (200):**

```json
{
  "success": true,
  "data": {
    "users": [
      {
        "id": "user-uuid",
        "email": "john@example.com",
        "name": "John Doe",
        "role": "developer",
        "isActive": true,
        "lastLogin": "2024-01-15T10:00:00Z",
        "createdAt": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 15,
      "pages": 1
    }
  }
}
```

---

#### POST /api/v1/users

Create new user.

**Headers:**

- `X-API-Key: {api-key}`
- `Content-Type: application/json`

**Required Role:** admin

**Request:**

```json
{
  "email": "newuser@example.com",
  "name": "New User",
  "password": "SecurePassword123!",
  "role": "developer"
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "newuser@example.com",
    "name": "New User",
    "role": "developer",
    "createdAt": "2024-01-15T10:30:00Z"
  }
}
```

---

#### GET /api/v1/user/profile

Get current user profile.

**Headers:** `X-API-Key: {api-key}`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "admin",
    "organizationId": "org-uuid",
    "preferences": {
      "theme": "dark",
      "notifications": true,
      "defaultProvider": "openai"
    },
    "usage": {
      "requestsToday": 150,
      "tokensToday": 15000,
      "costToday": 0.45
    },
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

---

#### PUT /api/v1/user/profile

Update current user profile.

**Headers:**

- `X-API-Key: {api-key}`
- `Content-Type: application/json`

**Request:**

```json
{
  "name": "John Updated Doe",
  "preferences": {
    "theme": "light",
    "defaultProvider": "anthropic"
  }
}
```

**Response (200):**

```json
{
  "success": true,
  "data": {
    "id": "user-uuid",
    "name": "John Updated Doe",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

---

### API Key Management Endpoints

#### GET /api/v1/api-keys

List API keys for current user.

**Headers:** `Authorization: Bearer {jwt-token}`

**Response (200):**

```json
{
  "success": true,
  "data": {
    "keys": [
      {
        "id": "key-uuid",
        "name": "CI/CD Key",
        "maskedKey": "node...xyz",
        "isActive": true,
        "rateLimit": 100,
        "permissions": ["chat", "analytics"],
        "lastUsed": "2024-01-15T10:00:00Z",
        "expiresAt": "2025-01-15T00:00:00Z",
        "createdAt": "2024-01-15T00:00:00Z"
      }
    ]
  }
}
```

---

#### POST /api/v1/api-keys

Create new API key.

**Headers:**

- `Authorization: Bearer {jwt-token}`
- `Content-Type: application/json`

**Request:**

```json
{
  "name": "Production API Key",
  "expiresAt": "2025-12-31T23:59:59Z",
  "rateLimit": 300,
  "permissions": ["chat", "analytics", "provider-keys"]
}
```

**Response (201):**

```json
{
  "success": true,
  "data": {
    "id": "key-uuid",
    "name": "Production API Key",
    "key": "node2ai-key-prod-abc123xyz456def789",
    "expiresAt": "2025-12-31T23:59:59Z",
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "warning": "Store this key securely - it will not be shown again"
}
```

---

#### DELETE /api/v1/api-keys/:id

Revoke API key.

**Headers:** `Authorization: Bearer {jwt-token}`

**Response (200):**

```json
{
  "success": true,
  "message": "API key revoked successfully"
}
```

---

### Health & Status Endpoints

#### GET /api/health

Health check endpoint (no authentication required).

**Response (200):**

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0.0",
  "uptime": 86400,
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

---

#### GET /api/v1/status

Detailed system status (requires authentication).

**Headers:** `X-API-Key: {api-key}`

**Required Role:** admin

**Response (200):**

```json
{
  "success": true,
  "data": {
    "status": "operational",
    "timestamp": "2024-01-15T10:30:00Z",
    "version": "1.0.0",
    "environment": "production",
    "services": {
      "api": {
        "status": "healthy",
        "latency": 45,
        "uptime": 99.99
      },
      "database": {
        "status": "healthy",
        "connections": 15,
        "maxConnections": 100,
        "latency": 12
      },
      "redis": {
        "status": "healthy",
        "memoryUsage": "45.2 MB",
        "connectedClients": 8
      },
      "providers": {
        "openai": "operational",
        "anthropic": "operational",
        "google": "operational",
        "perplexity": "operational"
      }
    },
    "metrics": {
      "requestsPerMinute": 150,
      "avgResponseTime": 850,
      "errorRate": 0.5
    }
  }
}
```

## Error Codes Reference

| Code                       | Description                     | HTTP Status | Solution                             |
| -------------------------- | ------------------------------- | ----------- | ------------------------------------ |
| `AUTH_REQUIRED`            | Authentication required         | 401         | Provide valid token or API key       |
| `INVALID_TOKEN`            | Invalid or expired token        | 401         | Re-authenticate to get new token     |
| `INVALID_API_KEY`          | Invalid API key                 | 401         | Check API key is correct             |
| `INSUFFICIENT_PERMISSIONS` | Lacking required permissions    | 403         | Contact admin for role upgrade       |
| `RESOURCE_NOT_FOUND`       | Requested resource not found    | 404         | Verify resource ID is correct        |
| `VALIDATION_ERROR`         | Request validation failed       | 400         | Check request parameters             |
| `RATE_LIMIT_EXCEEDED`      | Rate limit exceeded             | 429         | Wait before retrying or upgrade tier |
| `PROVIDER_ERROR`           | AI provider error               | 502         | Check provider status                |
| `PROVIDER_KEY_INVALID`     | Provider key is invalid         | 502         | Update provider key                  |
| `QUOTA_EXCEEDED`           | Usage quota exceeded            | 429         | Check billing or increase limits     |
| `INSUFFICIENT_CREDITS`     | Insufficient credits            | 402         | Add credits or payment method        |
| `MODEL_NOT_AVAILABLE`      | Requested model unavailable     | 400         | Use different model                  |
| `INTERNAL_ERROR`           | Internal server error           | 500         | Retry or contact support             |
| `SERVICE_UNAVAILABLE`      | Service temporarily unavailable | 503         | Retry with backoff                   |

## SDKs & Client Libraries

### JavaScript/TypeScript SDK

**Installation:**

```bash
npm install @node2ai/sdk
```

**Basic Usage:**

```typescript
import { Node2AI } from '@node2ai/sdk';

const client = new Node2AI({
  apiKey: process.env.NODE2AI_API_KEY,
  baseURL: 'https://api.yourdomain.com',
});

// Send chat message
const response = await client.chat.create({
  message: 'Hello, World!',
  provider: 'openai',
  model: 'gpt-4',
  options: {
    maxTokens: 500,
    temperature: 0.7,
  },
});

console.log(response.message);
```

**Streaming:**

```typescript
// Stream response
const stream = await client.chat.stream({
  message: 'Explain quantum computing',
  provider: 'openai',
  model: 'gpt-4',
});

stream.on('token', token => {
  process.stdout.write(token);
});

stream.on('end', usage => {
  console.log('\nTotal tokens:', usage.totalTokens);
});
```

**Analytics:**

```typescript
// Analytics
const usage = await client.analytics.getUsage({
  startDate: '2024-01-01',
  endDate: '2024-01-15',
  groupBy: 'day',
});

console.log('Total cost:', usage.summary.totalCost);
```

### Python SDK

**Installation:**

```bash
pip install node2ai
```

**Basic Usage:**

```python
from node2ai import Node2AI

client = Node2AI(api_key='your-api-key')

# Send chat message
response = client.chat.create(
    message='Hello, World!',
    provider='openai',
    model='gpt-4',
    options={
        'max_tokens': 500,
        'temperature': 0.7
    }
)

print(response.message)
```

**Streaming:**

```python
# Stream response
for token in client.chat.stream(
    message='Explain quantum computing',
    provider='openai',
    model='gpt-4'
):
    print(token, end='', flush=True)
```

**Analytics:**

```python
# Analytics
usage = client.analytics.get_usage(
    start_date='2024-01-01',
    end_date='2024-01-15',
    group_by='day'
)

print(f'Total cost: ${usage["summary"]["totalCost"]}')
```

### Go SDK

**Installation:**

```bash
go get github.com/foundry360/node2ai-go
```

**Basic Usage:**

```go
package main

import (
    "fmt"
    "log"
    "github.com/foundry360/node2ai-go"
)

func main() {
    client := node2ai.NewClient("your-api-key")

    response, err := client.Chat.Create(node2ai.ChatRequest{
        Message:  "Hello, World!",
        Provider: "openai",
        Model:    "gpt-4",
        Options: node2ai.ChatOptions{
            MaxTokens:   500,
            Temperature: 0.7,
        },
    })

    if err != nil {
        log.Fatal(err)
    }

    fmt.Println(response.Message)
}
```

## Best Practices

### Authentication

**✅ Do:**

- Use API keys for server-to-server communication
- Use JWT tokens for user-facing applications
- Rotate API keys every 90 days
- Store keys in environment variables
- Use different keys for different environments

**❌ Don't:**

- Never expose API keys in client-side code
- Don't commit keys to version control
- Don't share keys between team members
- Don't use production keys in development

### Error Handling

**Robust Error Handling:**

```typescript
async function makeRequest() {
  try {
    const response = await client.chat.create({...});
    return response;
  } catch (error) {
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      // Wait and retry
      await sleep(error.retryAfter * 1000);
      return makeRequest();
    } else if (error.code === 'PROVIDER_ERROR') {
      // Try different provider
      return client.chat.create({
        ...params,
        provider: 'anthropic'
      });
    } else {
      // Log and re-throw
      console.error('API error:', error);
      throw error;
    }
  }
}
```

### Rate Limiting

**Implement Exponential Backoff:**

```javascript
async function makeRequestWithBackoff(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        const resetTime = response.headers.get('X-RateLimit-Reset');
        const waitTime = Math.pow(2, i) * 1000; // Exponential backoff

        console.log(`Rate limited. Waiting ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }

      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * i));
    }
  }
}
```

### Performance

**Optimize for Performance:**

- Use streaming for long responses
- Implement request timeouts
- Cache provider key lookups
- Use connection pooling
- Batch requests where possible

**Example Timeout Implementation:**

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

try {
  const response = await fetch(url, {
    ...options,
    signal: controller.signal,
  });
  clearTimeout(timeoutId);
  return response;
} catch (error) {
  clearTimeout(timeoutId);
  if (error.name === 'AbortError') {
    throw new Error('Request timeout');
  }
  throw error;
}
```

### Security

**Security Best Practices:**

- Always use HTTPS
- Validate SSL certificates
- Don't log sensitive data
- Sanitize user input
- Implement CSRF protection (for web apps)
- Use secure key storage

**Input Sanitization:**

```javascript
function sanitizeInput(input) {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML
    .replace(/['"]/g, '') // Remove quotes
    .trim()
    .substring(0, 10000); // Limit length
}
```

## Webhooks

Configure webhooks to receive real-time notifications about events in your Node2AI account.

### Setup Webhook

```bash
curl -X POST https://api.yourdomain.com/api/v1/webhooks \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/node2ai",
    "events": ["chat.completed", "usage.threshold", "key.test.failed"],
    "secret": "your-webhook-secret"
  }'
```

### Webhook Events

| Event             | Description              | Payload                |
| ----------------- | ------------------------ | ---------------------- |
| `chat.completed`  | Chat request completed   | Chat object with usage |
| `usage.threshold` | Usage threshold exceeded | Usage data             |
| `key.test.failed` | Provider key test failed | Key and error details  |
| `user.created`    | New user created         | User object            |
| `user.updated`    | User updated             | User object            |
| `api_key.created` | API key created          | API key object         |
| `api_key.revoked` | API key revoked          | API key object         |

### Webhook Payload

```json
{
  "event": "chat.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "conversationId": "conv-uuid",
    "messageId": "msg-uuid",
    "provider": "openai",
    "model": "gpt-4",
    "tokens": 201,
    "cost": 0.00603
  },
  "signature": "hmac-sha256-signature"
}
```

### Verify Webhook Signature

**JavaScript:**

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = hmac.update(JSON.stringify(payload)).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
```

**Python:**

```python
import hmac
import hashlib
import json

def verify_webhook(payload, signature, secret):
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        json.dumps(payload).encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(signature, expected_signature)
```

## Pagination

All list endpoints support pagination with consistent parameters and response format.

### Query Parameters

- `page`: Page number (1-indexed, default: 1)
- `limit`: Items per page (default: 20, max: 100)
- `sortBy`: Sort field (varies by endpoint)
- `order`: Sort order (asc, desc)

### Response Format

```json
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "pages": 8,
    "hasMore": true,
    "prev": "/api/v1/resource?page=1&limit=20",
    "next": "/api/v1/resource?page=3&limit=20"
  }
}
```

### Pagination Example

```javascript
async function getAllUsers() {
  const users = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await client.users.list({ page, limit: 100 });
    users.push(...response.data.users);
    hasMore = response.pagination.hasMore;
    page++;
  }

  return users;
}
```

## Versioning

### API Versioning

API versioning is handled via URL path:

- **Current Version**: `/api/v1/*`
- **Future Versions**: `/api/v2/*`, `/api/v3/*`

### Deprecation Policy

- **6 months notice** before deprecation
- **Deprecated endpoints** return warning headers
- **Old versions** supported for 12 months
- **Migration guides** provided for breaking changes

### Version Headers

```http
API-Version: v1
Deprecation: true
Sunset: 2025-06-15
```

## OpenAPI Specification

### Download OpenAPI Spec

```bash
curl https://api.yourdomain.com/api/docs/openapi.json > openapi.json
```

### Interactive API Explorer

Visit the interactive API documentation at:
https://api.yourdomain.com/api/docs

### Postman Collection

Import the Postman collection:

```bash
https://api.yourdomain.com/api/docs/postman.json
```

## Support & Resources

### Documentation

- **API Documentation**: https://docs.foundry360.com/node2ai/api
- **SDK Documentation**: https://docs.foundry360.com/node2ai/sdk
- **Integration Guides**: https://docs.foundry360.com/node2ai/integrations

### Status & Monitoring

- **Status Page**: https://status.foundry360.com
- **API Health**: https://api.yourdomain.com/api/health
- **System Status**: https://api.yourdomain.com/api/v1/status

### Community & Support

- **Community Forum**: https://community.foundry360.com
- **GitHub Issues**: https://github.com/foundry360/node2ai/issues
- **Discord**: https://discord.gg/node2ai
- **Stack Overflow**: Tag: `node2ai`

### Contact

- **API Support**: api-support@foundry360.com
- **General Support**: support@foundry360.com
- **Security Issues**: security@foundry360.com
- **Sales**: sales@foundry360.com

---

**Ready to get started?** Check out our [Quick Start Guide](https://docs.foundry360.com/node2ai/quickstart) or explore the [Interactive API Explorer](https://api.yourdomain.com/api/docs).
