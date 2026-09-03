# License Management System - Quick Start

## 🎉 What's Been Deployed

A complete license management system is now live in Node2AI. This includes:

- **Database schema** for license storage
- **API endpoints** for license management
- **Enforcement middleware** for protected routes
- **Usage tracking** integration
- **Key generation** tools
- **UI interface** in Account Settings

## 🚀 Getting Started

### 1. Generate License Keys

```bash
pnpm run generate-license-keys
```

Copy the output to your `.env` file.

### 2. Set Environment Variables

Add to your `.env`:

```bash
LICENSE_PUBLIC_KEY="..."
LICENSE_PRIVATE_KEY="..."
DATABASE_URL="postgresql://node2:changeme@db:5432/node2ai"
```

### 3. Run Database Migration

The migration scripts are in `migrations/`. Run them against your PostgreSQL database.

### 4. Access License UI

1. Navigate to **Settings** → **License** tab
2. View current license information
3. Activate a new license by clicking "Activate License"

## 📋 Features

### License Validation

- Validates license signatures
- Checks expiration dates
- Verifies seat limits
- Enforces API call limits

### Usage Tracking

- Real-time seat count monitoring
- Monthly API call tracking
- Automatic limit enforcement

### API Protection

- Middleware protects all routes
- Configurable enforcement options
- Feature-based access control

### UI Management

- View license details
- Activate new licenses
- Monitor usage metrics
- View enabled features

## 🔧 Usage Examples

### Protect an API Route

```typescript
import { withLicenseAuth } from '@/lib/middleware';

export async function GET(request: NextRequest) {
  return withLicenseAuth(
    async (authRequest: AuthenticatedRequest) => {
      // Your handler code here
      // License is already validated
    },
    { checkApiLimit: true }
  )(request);
}
```

### Check License Feature

```typescript
import { checkLicenseFeature } from '@/lib/middleware';

const { allowed } = await checkLicenseFeature(
  organizationId,
  LicenseFeature.ADVANCED_ANALYTICS
);
```

### Generate a Test License

```typescript
import { licenseManager } from '@node2ai/licensing';

const license = await licenseManager.generateLicense({
  organizationName: 'Test Org',
  organizationId: 'uuid-here',
  tier: LicenseTier.PROFESSIONAL,
  maxSeats: 10,
  validityDays: 365,
});
```

## 📚 Documentation

- **Full Guide**: [LICENSE_KEY_MANAGEMENT.md](./LICENSE_KEY_MANAGEMENT.md)
- **Database Schema**: [migrations/LICENSING_DATABASE_GUIDE.md](../migrations/LICENSING_DATABASE_GUIDE.md)

## 🧪 Testing

1. **Test Key Generation**: `pnpm run generate-license-keys`
2. **Test UI**: Navigate to Settings → License
3. **Test API**: POST to `/api/v1/admin/license` with a license key

## 🎯 Next Steps

1. Configure environment variables
2. Generate your signing keys
3. Create initial licenses for your organization
4. Activate licenses through the UI
5. Monitor usage in the license tab

## ⚠️ Important Notes

- Private keys MUST be kept secure
- Never commit keys to version control
- Rotate keys periodically (every 90-180 days)
- Monitor usage to avoid limit breaches

## 🆘 Troubleshooting

**Problem**: License validation fails

- Check that keys are properly formatted in `.env`
- Verify database migration completed successfully
- Ensure `DATABASE_URL` and `JWT_SECRET` are present in environment

**Problem**: Usage tracking not working

- Verify `usage_events` table exists
- Check organization ID is correct
- Review database permissions

## ✨ Success!

Your license management system is now deployed and ready to use!

For support or questions, refer to the full documentation or contact your administrator.
