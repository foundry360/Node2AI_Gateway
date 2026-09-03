# License Key Management

This guide covers managing RSA key pairs for signing and verifying Node2AI licenses.

## Overview

Node2AI uses RSA-2048 key pairs to sign license keys. This ensures:

- **Authentication**: Licenses are verifiably issued by Node2AI
- **Integrity**: Licenses cannot be tampered with
- **Non-repudiation**: Signed licenses serve as proof of issue

## Key Generation

### Quick Start

Generate new license signing keys:

```bash
pnpm run generate-license-keys
```

This will output:

1. Public key (can be shared)
2. Private key (MUST be kept secret)
3. Formatted environment variables

### Saving Keys Locally

To save keys to files (development only):

```bash
pnpm run generate-license-keys -- --save
```

This creates a `keys/` directory with:

- `license-public.pem` - Public key
- `license-private.pem` - Private key (mode 0600)

⚠️ **WARNING**: Never commit private keys to version control!

## Environment Configuration

### Development

Add the generated keys to your `.env` file:

```bash
# License Signing Keys
LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\n-----END PUBLIC KEY-----"
LICENSE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwg...\n-----END PRIVATE KEY-----"
```

### Production

**Recommended Approaches:**

#### Option 1: Environment Variables (Simple)

Store keys as environment variables in your deployment system:

- Docker: `docker-compose.yml` env section
- Kubernetes: Secrets
- Cloud platforms: Secret management (AWS Secrets Manager, Azure Key Vault, etc.)

#### Option 2: Cloud Secret Management (Recommended)

Use your cloud provider's secret management:

**AWS:**

```bash
aws secretsmanager create-secret \
  --name node2ai/license-keys \
  --secret-string '{"public":"...","private":"..."}'
```

**Azure:**

```bash
az keyvault secret set \
  --vault-name node2ai-secrets \
  --name license-public-key \
  --value "-----BEGIN PUBLIC KEY-----..."
```

**Google Cloud:**

```bash
echo -n "-----BEGIN PRIVATE KEY-----..." | \
  gcloud secrets create license-private-key --data-file=-
```

#### Option 3: HashiCorp Vault

Store keys in Vault with appropriate access policies:

```bash
vault kv put secret/node2ai/license-keys \
  public="-----BEGIN PUBLIC KEY-----..." \
  private="-----BEGIN PRIVATE KEY-----..."
```

## Key Distribution

### Public Key

The public key **can and should** be:

- Shared with all deployments
- Included in application builds
- Stored in database (for validation)
- Committed to version control (in a keys directory)

It cannot be used to create licenses, only to verify them.

### Private Key

The private key **MUST**:

- Be kept in secure key management system
- Never be committed to version control
- Only be accessible to license generation systems
- Have restricted access (minimum privilege)
- Be backed up securely

It is used to **sign** new licenses.

## Key Rotation

### When to Rotate

Rotate your signing keys when:

- Key compromise is suspected
- Every 90-180 days (best practice)
- After security incident
- As required by compliance standards

### Rotation Process

1. **Generate new keys:**

   ```bash
   pnpm run generate-license-keys
   ```

2. **Update key management system:**
   - Update new keys in secrets manager
   - Keep old keys temporarily for transition

3. **Update application configuration:**

   ```bash
   # Update environment variables
   LICENSE_PUBLIC_KEY="<new-public-key>"
   LICENSE_PRIVATE_KEY="<new-private-key>"
   ```

4. **Grace period:**
   - Support both old and new keys for 30-60 days
   - Generate new licenses with new key
   - Existing licenses signed with old key continue to work

5. **Disable old keys:**
   - Remove from configuration after grace period

## Security Best Practices

### 1. Access Control

- Limit private key access to license generation systems only
- Use role-based access control (RBAC)
- Log all private key access

### 2. Monitoring

- Monitor for unusual license generation activity
- Alert on access to private key
- Track license generation frequency

### 3. Backup and Recovery

- Store encrypted backups in secure location
- Test backup restoration process
- Maintain offline backups for disaster recovery

### 4. Compliance

For regulated industries:

- Follow SOC 2, HIPAA, GDPR key management requirements
- Document key generation, storage, and rotation procedures
- Maintain audit logs of key access

## Generating Test Licenses

Once keys are configured, generate test licenses:

```bash
# Using the CLI
pnpm --filter @node2ai/licensing run cli generate \
  --org "Test Organization" \
  --org-id "00000000-0000-0000-0000-000000000001" \
  --tier "professional" \
  --seats 10 \
  --validity 365
```

## Troubleshooting

### Common Issues

**Problem**: "Failed to validate license signature"

- **Solution**: Ensure public key matches the key used to sign the license

**Problem**: "License key generation failed"

- **Solution**: Verify private key is correctly formatted in environment variable

**Problem**: "New line characters not working in env vars"

- **Solution**: Use `\\n` escaped newlines in .env file, or use multiline format

### Verification

Test that keys are working:

```bash
# Check keys are loaded
pnpm --filter @node2ai/licensing run cli validate --help

# Generate a test license
pnpm --filter @node2ai/licensing run cli generate \
  --org "Test" \
  --tier starter \
  --seats 5
```

## Additional Resources

- [License Database Guide](./LICENSING_DATABASE_GUIDE.md)
- [License API Reference](../migrations/LICENSING_DATABASE_GUIDE.md)
- [Security Configuration](./CONFIGURATION.md#security-configuration)

## Support

For license key issues:

1. Check this documentation
2. Review audit logs
3. Contact Node2AI support with license details (never share private key)
