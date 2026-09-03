# Node2AI Authentication Guide

This guide explains how to implement authentication and authorization in Node2AI API endpoints.

## Overview

Node2AI supports two authentication methods:

- **JWT Tokens**: For user-based authentication
- **API Keys**: For service-to-service authentication

## Authentication Middleware

### Basic Usage

```typescript
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    // Your endpoint logic here
    // authRequest.auth contains user information
    const userId = authRequest.auth?.userId;
    const organizationId = authRequest.auth?.organizationId;
    const role = authRequest.auth?.role;

    return NextResponse.json({
      success: true,
      data: { userId, organizationId, role },
    });
  });
}
```

### Role-Based Access Control

```typescript
import {
  authMiddleware,
  requireRole,
  AuthenticatedRequest,
} from '@/lib/middleware/auth';

export async function POST(request: NextRequest) {
  return authMiddleware(
    request,
    requireRole(['admin', 'developer'])(
      async (authRequest: AuthenticatedRequest) => {
        // Only admin and developer roles can access this endpoint
        // Your endpoint logic here
      }
    )
  );
}
```

## Authentication Methods

### JWT Authentication

JWT tokens are used for user authentication and include user information.

**Headers:**

```
Authorization: Bearer <jwt-token>
```

**Token Generation:**

```typescript
import { generateJWT } from '@/lib/middleware/auth';

const token = generateJWT({
  userId: 'user-123',
  organizationId: 'org-123',
  role: 'admin',
  permissions: ['*'],
  expiresIn: '24h',
});
```

### API Key Authentication

API keys are used for service-to-service authentication.

**Headers:**

```
X-API-Key: <api-key>
```

**API Key Validation:**

- API keys are hashed and stored in the database
- Keys are validated by comparing the provided key with stored hashes
- Last used timestamp is updated on successful validation

## User Roles

Node2AI supports the following user roles:

- **admin**: Full access to all features
- **developer**: Access to development and testing features
- **viewer**: Read-only access to most features
- **auditor**: Access to audit logs and compliance features

## Protected Endpoint Examples

### 1. Basic Protected Endpoint

```typescript
// apps/api/src/app/api/v1/protected/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    return NextResponse.json({
      success: true,
      data: {
        message: 'This endpoint requires authentication',
        user: authRequest.auth?.userId,
        organization: authRequest.auth?.organizationId,
      },
    });
  });
}
```

### 2. Admin-Only Endpoint

```typescript
// apps/api/src/app/api/v1/admin/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  authMiddleware,
  requireRole,
  AuthenticatedRequest,
} from '@/lib/middleware/auth';

export async function POST(request: NextRequest) {
  return authMiddleware(
    request,
    requireRole(['admin'])(async (authRequest: AuthenticatedRequest) => {
      // Only admins can access this endpoint
      return NextResponse.json({
        success: true,
        data: { message: 'Admin action completed' },
      });
    })
  );
}
```

### 3. Multi-Role Endpoint

```typescript
// apps/api/src/app/api/v1/developer/route.ts
import { NextRequest, NextResponse } from 'next/server';
import {
  authMiddleware,
  requireRole,
  AuthenticatedRequest,
} from '@/lib/middleware/auth';

export async function GET(request: NextRequest) {
  return authMiddleware(
    request,
    requireRole(['admin', 'developer'])(
      async (authRequest: AuthenticatedRequest) => {
        // Both admins and developers can access this endpoint
        return NextResponse.json({
          success: true,
          data: { message: 'Developer endpoint accessed' },
        });
      }
    )
  );
}
```

## Error Responses

### Authentication Required (401)

```json
{
  "success": false,
  "data": null,
  "message": "Authentication required",
  "error": "Missing or invalid Authorization header or X-API-Key"
}
```

### Insufficient Permissions (403)

```json
{
  "success": false,
  "data": null,
  "message": "Insufficient permissions",
  "error": "Role 'viewer' not allowed. Required: admin, developer"
}
```

### Authentication Failed (500)

```json
{
  "success": false,
  "data": null,
  "message": "Authentication failed",
  "error": "JWT_SECRET not configured"
}
```

## Testing Authentication

### Using the Test Script

```bash
# Run authentication tests
pnpm run test:auth

# Test with custom API URL
API_BASE_URL=http://localhost:3001 pnpm run test:auth
```

### Manual Testing

#### JWT Authentication

```bash
# Generate JWT token (using the seed script)
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@node2.ai", "password": "admin123"}'

# Use JWT token
curl -X GET http://localhost:3001/api/v1/protected \
  -H "Authorization: Bearer <jwt-token>"
```

#### API Key Authentication

```bash
# Use API key
curl -X GET http://localhost:3001/api/v1/protected \
  -H "X-API-Key: test-api-key-123"
```

## Security Best Practices

### 1. Environment Variables

Ensure these environment variables are set:

```bash
JWT_SECRET=your-secure-jwt-secret-here
DATABASE_URL=postgresql://user:pass@host:port/db
```

### 2. Password Hashing

Use bcrypt with appropriate salt rounds:

```typescript
import * as bcrypt from 'bcryptjs';

const saltRounds = 12;
const hash = bcrypt.hashSync(password, saltRounds);
const isValid = bcrypt.compareSync(password, hash);
```

### 3. API Key Security

- API keys are hashed before storage
- Keys are never returned in API responses
- Last used timestamp is tracked
- Expired keys are automatically rejected

### 4. JWT Security

- Use strong JWT secrets
- Set appropriate expiration times
- Include issuer and audience claims
- Validate tokens on every request

## Common Patterns

### 1. Organization-Scoped Data

```typescript
export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    const organizationId = authRequest.auth?.organizationId;

    // Query data scoped to organization
    const data = await db.someTable.findMany({
      where: { organizationId },
    });

    return NextResponse.json({ success: true, data });
  });
}
```

### 2. User-Scoped Data

```typescript
export async function GET(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    const userId = authRequest.auth?.userId;

    // Query data scoped to user
    const data = await db.userData.findMany({
      where: { userId },
    });

    return NextResponse.json({ success: true, data });
  });
}
```

### 3. Audit Logging

```typescript
export async function POST(request: NextRequest) {
  return authMiddleware(request, async (authRequest: AuthenticatedRequest) => {
    // Perform action
    const result = await performAction();

    // Log audit event
    await db.auditLog.create({
      data: {
        organizationId: authRequest.auth?.organizationId,
        userId: authRequest.auth?.userId,
        action: 'API_CALL',
        resourceType: 'endpoint',
        details: { endpoint: '/api/v1/action' },
      },
    });

    return NextResponse.json({ success: true, data: result });
  });
}
```

## Migration Guide

### Protecting Existing Endpoints

1. **Import the middleware:**

   ```typescript
   import { authMiddleware, AuthenticatedRequest } from '@/lib/middleware/auth';
   ```

2. **Wrap your handler:**

   ```typescript
   export async function GET(request: NextRequest) {
     return authMiddleware(
       request,
       async (authRequest: AuthenticatedRequest) => {
         // Your existing logic here
       }
     );
   }
   ```

3. **Add role restrictions if needed:**
   ```typescript
   export async function POST(request: NextRequest) {
     return authMiddleware(
       request,
       requireRole(['admin'])(async (authRequest: AuthenticatedRequest) => {
         // Your existing logic here
       })
     );
   }
   ```

### Testing Protected Endpoints

1. **Run the authentication test script:**

   ```bash
   pnpm run test:auth
   ```

2. **Test with different roles:**
   - Admin: `admin@node2.ai` / `admin123`
   - Developer: `developer@node2.ai` / `dev123`
   - Viewer: `viewer@node2.ai` / `view123`

3. **Test with API keys:**
   - Default: `test-api-key-123`
   - Developer: `dev-api-key-456`
   - Viewer: `view-api-key-789`

## Troubleshooting

### Common Issues

1. **"JWT_SECRET not configured"**
   - Set the `JWT_SECRET` environment variable
   - Use a strong, random secret

2. **"Authentication required"**
   - Ensure the endpoint is wrapped with `authMiddleware`
   - Check that credentials are provided in headers

3. **"Insufficient permissions"**
   - Verify the user has the required role
   - Check the `requireRole` configuration

4. **API key validation fails**
   - Ensure the API key exists in the database
   - Check that the key is not expired
   - Verify the key is active

### Debug Mode

Enable debug logging by setting:

```bash
DEBUG=node2:auth
```

This will log authentication attempts and failures for debugging.
