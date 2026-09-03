# Node2AI Seed Data Script

This script creates default users, API keys, and sample data for Node2AI testing and development.

## Features

- **Default Admin User**: Creates admin@node2.ai with admin123 password
- **Multiple User Roles**: Creates users with admin, developer, viewer, and auditor roles
- **API Keys**: Generates test API keys for different access levels
- **Provider Keys**: Sets up encrypted keys for OpenAI, Anthropic, and Google
- **Sample Data**: Creates usage events, audit logs, and token mappings
- **Idempotent**: Safe to run multiple times, updates existing data
- **Password Hashing**: Uses bcrypt with proper salt rounds for security

## Usage

### Basic Seeding

```bash
# Create all default data
pnpm run seed

# Skip if data already exists
pnpm run seed:skip

# Clean existing data first
pnpm run seed:clean
```

### Direct Script Usage

```bash
# Run with ts-node directly
npx ts-node scripts/seed-data.ts

# Clean data
npx ts-node scripts/seed-data.ts clean

# Skip if exists
npx ts-node scripts/seed-data.ts --skip-if-exists
```

## Default Credentials

### Users

- **Admin**: admin@node2.ai / admin123
- **Developer**: developer@node2.ai / dev123
- **Viewer**: viewer@node2.ai / view123
- **Auditor**: auditor@node2.ai / audit123

### API Keys

- **Default**: test-api-key-123 (1000 req/min)
- **Developer**: dev-api-key-456 (500 req/min)
- **Viewer**: view-api-key-789 (100 req/min)

### Organization

- **ID**: default-org
- **Name**: Default Organization
- **Tier**: Enterprise

## Sample Data Created

### Usage Events

- OpenAI GPT-4 requests with sanitization
- Anthropic Claude-3-Sonnet requests
- Google Gemini-Pro requests
- Various token counts and costs
- Different latency measurements

### Audit Logs

- Login success/failure events
- API key creation events
- Data sanitization events
- User action tracking

### Provider Keys

- Encrypted OpenAI API key
- Encrypted Anthropic API key
- Encrypted Google API key
- Metadata for each provider

## Configuration

The script uses environment variables for database connection:

```bash
# Default connection
DATABASE_URL=postgresql://node2:node2123@localhost:5432/node2

# Custom connection
DATABASE_URL=postgresql://user:pass@host:port/db pnpm run seed
```

## Security Features

- **Password Hashing**: Uses bcrypt with 12 salt rounds
- **API Key Hashing**: API keys are hashed before storage
- **Encrypted Provider Keys**: Provider API keys are encrypted
- **Audit Logging**: All actions are logged for compliance
- **Role-Based Access**: Different users have different permissions

## Error Handling

- **Database Connection**: Validates database connectivity
- **Data Validation**: Checks for required fields and formats
- **Duplicate Prevention**: Uses upsert operations to prevent duplicates
- **Rollback Support**: Failed operations don't leave partial data
- **Detailed Logging**: Comprehensive error messages and status updates

## Development Notes

- **Idempotent Design**: Safe to run multiple times
- **Update Existing**: Updates existing records instead of failing
- **Comprehensive Logging**: Color-coded output for easy debugging
- **Type Safety**: Full TypeScript support with Prisma types
- **Error Recovery**: Graceful handling of partial failures

## Troubleshooting

### Common Issues

1. **Database Connection Failed**
   - Check DATABASE_URL environment variable
   - Ensure PostgreSQL is running
   - Verify database credentials

2. **Permission Denied**
   - Check database user permissions
   - Ensure user can create/update tables
   - Verify organization exists

3. **Duplicate Key Errors**
   - Use `--skip-if-exists` flag
   - Run `seed:clean` first
   - Check for existing data conflicts

### Debug Mode

Enable detailed logging by setting:

```bash
DEBUG=node2:seed npx ts-node scripts/seed-data.ts
```

## Integration

The seed script integrates with:

- **Prisma ORM**: Uses Prisma client for database operations
- **bcryptjs**: For password hashing
- **uuid**: For generating unique identifiers
- **ts-node**: For TypeScript execution

## Production Considerations

- **Remove Default Passwords**: Change all default passwords in production
- **Rotate API Keys**: Generate new API keys for production use
- **Update Provider Keys**: Replace placeholder keys with real API keys
- **Review Permissions**: Ensure role-based access is properly configured
- **Audit Logging**: Monitor audit logs for security events
