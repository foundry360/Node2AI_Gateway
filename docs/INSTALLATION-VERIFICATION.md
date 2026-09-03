# Node2AI Installation Verification Guide

This guide explains how to verify that Node2AI has been properly installed and configured using the comprehensive test script.

## Overview

The installation verification script (`scripts/test-installation.sh`) performs a complete end-to-end test of all Node2AI components to ensure everything is working correctly.

## Prerequisites

Before running the verification script, ensure you have:

1. **Node2AI Services Running**:
   - API service on port 3001
   - Web dashboard on port 3000
   - PostgreSQL database on port 5432

2. **Required Tools Installed**:
   - `curl` - for API testing
   - `jq` - for JSON processing
   - `psql` - for database testing
   - `openssl` - for JWT generation

3. **Environment Variables Set**:
   ```bash
   export JWT_SECRET="your-jwt-secret-here"
   export PROVIDER_KEY_ENCRYPTION_KEY="your-32-character-hex-key"
   export DATABASE_URL="postgresql://node2:changeme@localhost:5432/node2"
   ```

## Running the Verification Script

### Basic Usage

```bash
# Run with default settings
pnpm run test:installation

# Or run directly
./scripts/test-installation.sh
```

### Custom Configuration

```bash
# Set custom URLs
API_BASE_URL=http://localhost:3001 \
WEB_BASE_URL=http://localhost:3000 \
DATABASE_URL=postgresql://user:pass@host:5432/db \
./scripts/test-installation.sh
```

### Docker Environment

```bash
# For Docker Compose setup
API_BASE_URL=http://localhost:3001 \
WEB_BASE_URL=http://localhost:3000 \
DATABASE_URL=postgresql://node2:changeme@postgres:5432/node2 \
./scripts/test-installation.sh
```

## Test Components

The verification script tests the following components:

### 1. **Required Tools** ✅

- Checks if `curl`, `jq`, `psql`, and `openssl` are installed
- Verifies all dependencies are available

### 2. **Services Running** ✅

- **API Service**: Port 3001 accessibility
- **Web Dashboard**: Port 3000 accessibility
- **Database**: Port 5432 accessibility

### 3. **Database Initialization** ✅

- **Connection Test**: Verifies database connectivity
- **Table Verification**: Checks all required tables exist
- **Default Organization**: Verifies `default-org` exists

### 4. **Default Admin User** ✅

- **User Exists**: Checks `admin@node2.ai` user exists
- **Role Verification**: Confirms user has `admin` role
- **Password Hash**: Verifies password is properly hashed

### 5. **JWT Authentication** ✅

- **Token Generation**: Creates valid JWT tokens
- **Token Validation**: Tests API authentication with JWT
- **Security**: Verifies proper JWT secret usage

### 6. **API Key Authentication** ✅

- **Key Exists**: Checks default API key exists
- **Key Validation**: Tests API authentication with API key
- **Security**: Verifies proper key hashing

### 7. **Provider Key Management** ✅

- **Add Provider Key**: Tests creating new provider keys
- **List Provider Keys**: Tests retrieving provider keys
- **Test Provider Key**: Tests connection validation
- **Encryption**: Verifies keys are properly encrypted

### 8. **API Prompt Processing** ✅

- **Smart Routing**: Tests the smart routing endpoint
- **Message Processing**: Verifies prompt handling
- **Response Generation**: Checks API response format

### 9. **Data Sanitization** ✅

- **Sanitization Engine**: Tests PII detection and removal
- **Text Processing**: Verifies sanitization works correctly
- **Security**: Ensures sensitive data is protected

### 10. **Usage Tracking** ✅

- **Usage Events**: Checks if usage is being tracked
- **Audit Logs**: Verifies audit logging is working
- **Data Persistence**: Confirms data is stored correctly

### 11. **Web Dashboard** ✅

- **Accessibility**: Tests web dashboard availability
- **UI Loading**: Verifies frontend is working
- **Navigation**: Checks basic web functionality

## Expected Output

### Successful Installation

```
Node2AI Installation Verification Script
==============================================

Configuration:
  API Base URL: http://localhost:3001
  Web Base URL: http://localhost:3000
  Database URL: postgresql://node2:changeme@localhost:5432/node2
  JWT Secret: dev-jwt-secret-chang...
  Provider Key Encryption Key: dev-provider-key-encry...

[INFO] Checking required tools...
[SUCCESS] All required tools are installed
[INFO] Checking if services are running...
[SUCCESS] API service is running on port 3001
[SUCCESS] Web service is running on port 3000
[SUCCESS] Database service is running on port 5432
...

============================================================
Node2AI Installation Verification Results
============================================================

Summary:
  Total Tests: 11
  Passed: 11
  Failed: 0

Detailed Results:
------------------------------------------------------------
✅ Required Tools
✅ Services Running
✅ Database Connection
✅ Database Tables
✅ Default Organization
✅ Admin User Exists
✅ Admin User Role
✅ JWT Generation
✅ JWT Validation
✅ API Key Exists
✅ API Key Validation
✅ Add Provider Key
✅ List Provider Keys
✅ Test Provider Key
✅ Get Key ID
✅ API Prompt Processing
✅ Data Sanitization
✅ Usage Tracking
✅ Audit Logging
✅ Web Dashboard

============================================================
🎉 All tests passed! Node2AI is properly installed and configured.

Next steps:
1. Access the web dashboard at: http://localhost:3000
2. Login with: admin@node2.ai / admin123
3. Configure your AI provider keys in the dashboard
4. Start using the API with your configured keys
```

### Failed Installation

```
============================================================
Node2AI Installation Verification Results
============================================================

Summary:
  Total Tests: 11
  Passed: 8
  Failed: 3

Detailed Results:
------------------------------------------------------------
✅ Required Tools
✅ Services Running
❌ Database Connection
   Error: Cannot connect to database
❌ Database Tables
   Error: Missing tables: users, organizations
❌ Default Organization
   Error: Default organization not found
...

============================================================
❌ 3 test(s) failed. Please check the errors above.

Troubleshooting:
1. Ensure all services are running (API, Web, Database)
2. Check that the database is properly initialized
3. Verify environment variables are set correctly
4. Check service logs for detailed error information
```

## Troubleshooting

### Common Issues

#### 1. **Database Connection Failed**

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if database exists
psql -h localhost -U node2 -d node2 -c "SELECT 1;"

# Initialize database if needed
pnpm run migrate
```

#### 2. **Services Not Running**

```bash
# Start all services
pnpm run dev

# Or start individually
pnpm --filter @node2/api dev
pnpm --filter @node2/web dev
```

#### 3. **Missing Tables**

```bash
# Run database migrations
pnpm run migrate

# Seed initial data
pnpm run seed
```

#### 4. **Authentication Issues**

```bash
# Check JWT secret is set
echo $JWT_SECRET

# Verify admin user exists
psql -h localhost -U node2 -d node2 -c "SELECT email, role FROM users;"
```

#### 5. **Provider Key Issues**

```bash
# Check encryption key is set
echo $PROVIDER_KEY_ENCRYPTION_KEY

# Verify provider key table
psql -h localhost -U node2 -d node2 -c "SELECT provider, is_active FROM provider_keys;"
```

### Environment Variables

Ensure these environment variables are properly set:

```bash
# Required for JWT authentication
export JWT_SECRET="your-secure-jwt-secret-here"

# Required for provider key encryption
export PROVIDER_KEY_ENCRYPTION_KEY="your-32-character-hex-key"

# Database connection
export DATABASE_URL="postgresql://node2:changeme@localhost:5432/node2"

# Optional: Custom API/Web URLs
export API_BASE_URL="http://localhost:3001"
export WEB_BASE_URL="http://localhost:3000"
```

### Service Logs

Check service logs for detailed error information:

```bash
# API service logs
pnpm --filter @node2/api logs

# Web service logs
pnpm --filter @node2/web logs

# Database logs
sudo journalctl -u postgresql
```

## Manual Verification

If the automated script fails, you can manually verify each component:

### 1. **Database Verification**

```bash
# Connect to database
psql -h localhost -U node2 -d node2

# Check tables
\dt

# Check admin user
SELECT email, role FROM users WHERE email = 'admin@node2.ai';

# Check default organization
SELECT id, name FROM organizations WHERE id = 'default-org';
```

### 2. **API Verification**

```bash
# Test health endpoint
curl http://localhost:3001/api/health

# Test with JWT
curl -H "Authorization: Bearer <jwt-token>" http://localhost:3001/api/health

# Test with API key
curl -H "X-API-Key: test-api-key-123" http://localhost:3001/api/health
```

### 3. **Web Dashboard Verification**

```bash
# Test web dashboard
curl http://localhost:3000

# Check if it returns HTML
curl -s http://localhost:3000 | grep -i "node2ai"
```

## Continuous Integration

The verification script can be integrated into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Verify Node2AI Installation
  run: |
    export JWT_SECRET="${{ secrets.JWT_SECRET }}"
    export PROVIDER_KEY_ENCRYPTION_KEY="${{ secrets.PROVIDER_KEY_ENCRYPTION_KEY }}"
    ./scripts/test-installation.sh
```

## Security Considerations

- **JWT Secret**: Use a strong, random JWT secret in production
- **Encryption Key**: Use a secure 32-character hex key for provider key encryption
- **Database Credentials**: Use strong passwords for database access
- **API Keys**: Store provider API keys securely and rotate regularly

## Support

If you encounter issues with the verification script:

1. **Check Logs**: Review service logs for detailed error information
2. **Verify Environment**: Ensure all environment variables are set correctly
3. **Test Manually**: Use the manual verification steps above
4. **Check Dependencies**: Ensure all required tools are installed
5. **Review Documentation**: Check the main README for setup instructions

The verification script provides a comprehensive way to ensure Node2AI is properly installed and configured, giving you confidence that all components are working correctly.
