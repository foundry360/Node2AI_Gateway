# ✅ Native Authentication Ready Checklist

Node2AI now uses native PostgreSQL authentication with JWT sessions. Use this checklist to verify everything is configured correctly.

## 1. Environment Variables

Ensure the API service has the following environment variables set:

```env
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>
JWT_SECRET=<generate-64-char-secret>
API_KEY_SECRET=<api-key-secret>
```

For the web app:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 2. Database Migrations

```bash
cd apps/api
pnpm db:migrate
```

Optional test data:

```bash
pnpm db:seed
```

## 3. Create an Admin User

```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@node2ai.ai",
    "password": "Admin123!",
    "name": "Node2 Admin",
    "organizationId": "00000000-0000-0000-0000-000000000001"
  }'
```

Alternatively, insert directly via SQL using `psql`.

## 4. Test Login Flow

```bash
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@node2ai.ai",
    "password": "Admin123!"
  }'
```

You should receive a JSON response containing a `token`. Store it in local storage or send it as a bearer token when calling APIs.

## 5. Verify Protected Endpoint

```bash
curl http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer <token-from-login>"
```

Expected response: user profile and organization data.

## 6. Web App Sign-In

1. Start both services (`pnpm dev` in `apps/api` and `apps/web`).
2. Visit http://localhost:3000.
3. Log in using the credentials created above.
4. Confirm dashboard data loads without “Not authenticated” warnings.

## 7. Production Notes

- Generate environment-specific `JWT_SECRET` values.
- Use managed PostgreSQL (RDS/Aurora/Cloud SQL) with SSL enabled.
- Rotate `API_KEY_SECRET` if compromised.
- Configure HTTPS in front of both services.

You're ready to ship native auth without Supabase. ✅
