# Node2AI API Testing with Postman

## Quick Start Guide

### 1. Import the Postman Collection

1. Open Postman
2. Click **Import** button
3. Select the file: `postman/Node2AI-API-Tests.postman_collection.json`
4. The collection will be imported with all test cases

### 2. Start the Node2AI API

Choose one of these methods:

#### Option A: Development Mode (Recommended)

```bash
# Start API in development mode
cd apps/api
pnpm install
pnpm run dev
```

#### Option B: Docker Mode (if Docker is available)

```bash
# Start with Docker
cd deployments/docker
docker compose up -d
```

#### Option C: Production Mode

```bash
# Build and start production
make build
make start
```

### 3. Verify API is Running

Test the health endpoint:

```bash
curl http://localhost:3001/api/health
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0"
}
```

## Postman Collection Overview

The collection includes **6 main test categories**:

### 🔐 Authentication Tests

- **Health Check** - Verify API is running
- **Register User** - Create new user account
- **Login User** - Authenticate and get token
- **Get Current User** - Retrieve user profile
- **Refresh Token** - Renew authentication token
- **Logout** - End session

### 🔑 Provider Keys Management

- **List Provider Keys** - View all configured API keys
- **Add OpenAI Key** - Configure OpenAI API key
- **Add Anthropic Key** - Configure Anthropic API key
- **Test Provider Key** - Validate API key works
- **Update Provider Key** - Modify key settings
- **Delete Provider Key** - Remove API key

### 💬 Chat & AI Processing

- **Simple Chat** - Basic AI conversation
- **Chat with PII Sanitization** - HIPAA-compliant chat
- **Smart Protected Chat** - Advanced protection mode
- **Multi-Provider Chat** - Compare responses from multiple AI providers

### 📊 Analytics & Monitoring

- **Get Usage Analytics** - View usage statistics
- **Get Cost Analytics** - Monitor API costs
- **Get Performance Metrics** - System performance data
- **Get Audit Logs** - Security and compliance logs

### 🏢 Organization Management

- **Get Organization Info** - Organization details
- **Update Organization** - Modify org settings
- **List Organization Users** - View all users
- **Add Organization User** - Invite new users

### 🛡️ Admin Functions

- **Get System Status** - Overall system health
- **Get License Info** - License validation and details
- **Get System Metrics** - Detailed system metrics
- **Create Backup** - Generate system backup

### 🔒 Sanitization Testing

- **Test PII Detection** - Identify PII in text
- **Sanitize Text** - Remove PII from text
- **Sanitize with Custom Rules** - Apply specific sanitization rules

## Testing Workflow

### Step 1: Authentication

1. Run **Health Check** to verify API is running
2. Run **Login User** to authenticate
   - Default credentials: `admin@node2ai.ai` / `admin123`
   - The token will be automatically saved to collection variables

### Step 2: Configure Provider Keys

1. Run **Add OpenAI Key** with your real OpenAI API key
2. Run **Add Anthropic Key** with your real Anthropic API key
3. Run **Test Provider Key** to verify keys work

### Step 3: Test Core Functionality

1. Run **Simple Chat** to test basic AI functionality
2. Run **Chat with PII Sanitization** to test HIPAA compliance
3. Run **Smart Protected Chat** for advanced protection

### Step 4: Test Analytics

1. Run **Get Usage Analytics** to see usage data
2. Run **Get Cost Analytics** to monitor costs
3. Run **Get Audit Logs** to review activity

### Step 5: Test Sanitization

1. Run **Test PII Detection** with sample medical data
2. Run **Sanitize Text** to see PII removal in action
3. Run **Sanitize with Custom Rules** for specific scenarios

## Sample Test Data

### PII/PHI Test Data

```json
{
  "text": "Patient John Smith (DOB: 01/15/1980, SSN: 123-45-6789, Email: john.smith@email.com, Phone: (555) 123-4567) has diabetes."
}
```

### Medical Record Test Data

```json
{
  "message": "Patient Sarah Johnson, MRN: 12345, has been diagnosed with hypertension. Her blood pressure readings are consistently elevated at 150/95 mmHg."
}
```

### Multi-Provider Test Data

```json
{
  "message": "Compare the treatment options for Type 2 diabetes",
  "providers": ["openai", "anthropic"],
  "models": ["gpt-4", "claude-3-sonnet-20240229"]
}
```

## Environment Variables

The collection uses these variables:

- `base_url`: `http://localhost:3001` (API base URL)
- `api_version`: `v1` (API version)
- `auth_token`: (automatically set after login)
- `user_id`: (automatically set after login)
- `organization_id`: (automatically set after login)

## Troubleshooting

### API Not Responding

1. Check if the API is running: `curl http://localhost:3001/api/health`
2. Check logs: `cd apps/api && pnpm run dev`
3. Verify port 3001 is not in use: `lsof -i :3001`

### Authentication Issues

1. Verify default credentials: `admin@node2ai.ai` / `admin123`
2. Check if user exists in database
3. Verify JWT_SECRET is set in environment

### Provider Key Issues

1. Ensure you have valid API keys from OpenAI/Anthropic
2. Check key format (OpenAI: `sk-...`, Anthropic: `sk-ant-...`)
3. Verify keys have sufficient credits/permissions

### Sanitization Not Working

1. Check if sanitization package is built: `cd packages/sanitization && pnpm run build`
2. Verify sanitization rules are loaded
3. Check logs for sanitization errors

## Advanced Testing

### Load Testing

Use Postman's Collection Runner to:

1. Run multiple iterations
2. Test with different data sets
3. Monitor response times
4. Verify error handling

### Security Testing

1. Test with invalid tokens
2. Test with malformed requests
3. Test rate limiting
4. Test input validation

### Compliance Testing

1. Test PII detection accuracy
2. Test sanitization completeness
3. Test audit log generation
4. Test data retention policies

## API Endpoints Reference

### Base URL

```
http://localhost:3001/api/v1
```

### Authentication Endpoints

- `GET /health` - Health check
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `GET /auth/me` - Current user info
- `POST /auth/refresh` - Refresh token
- `POST /auth/logout` - User logout

### Provider Keys Endpoints

- `GET /provider-keys` - List keys
- `POST /provider-keys` - Add key
- `POST /provider-keys/test` - Test key
- `PUT /provider-keys/:id` - Update key
- `DELETE /provider-keys/:id` - Delete key

### Chat Endpoints

- `POST /chat` - Simple chat
- `POST /chat/sanitized` - PII-sanitized chat
- `POST /chat/smart-protected` - Advanced protection
- `POST /chat/multi-provider` - Multi-provider chat

### Analytics Endpoints

- `GET /analytics/usage` - Usage statistics
- `GET /analytics/costs` - Cost analysis
- `GET /analytics/performance` - Performance metrics
- `GET /analytics/audit` - Audit logs

### Organization Endpoints

- `GET /organization` - Organization info
- `PUT /organization` - Update organization
- `GET /organization/users` - List users
- `POST /organization/users` - Add user

### Admin Endpoints

- `GET /admin/status` - System status
- `GET /admin/license` - License info
- `GET /admin/metrics` - System metrics
- `POST /admin/backup` - Create backup

### Sanitization Endpoints

- `POST /sanitize/detect` - Detect PII
- `POST /sanitize/text` - Sanitize text
- `POST /sanitize/custom` - Custom sanitization

## Next Steps

1. **Import the collection** into Postman
2. **Start the API** using one of the methods above
3. **Run the authentication tests** first
4. **Configure your provider keys** with real API keys
5. **Test the core functionality** with various scenarios
6. **Explore the analytics** to understand usage patterns
7. **Test sanitization** with realistic medical data

This comprehensive testing suite will help you validate all aspects of the Node2AI API functionality!
