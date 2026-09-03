# Hyperledger Explorer Credentials

## Default Admin Credentials

**Username:** `exploreradmin`  
**Password:** `exploreradminpw`

## Access Information

- **URL**: http://localhost:8090
- **Username**: `exploreradmin`
- **Password**: `exploreradminpw`

## Configuration Location

These credentials are configured in the Explorer connection profile:

**File:** `~/hyperledger/blockchain-explorer/examples/net1/connection-profile/node2ai-network.json`

```json
{
  "client": {
    "adminCredential": {
      "id": "exploreradmin",
      "password": "exploreradminpw"
    },
    "enableAuthentication": true
  }
}
```

## Security Notes

⚠️ **IMPORTANT**: These are default credentials for development/testing.

**For Production:**

1. Change the password immediately after first login
2. Update the connection profile with a strong password
3. Use environment variables or secrets management
4. Never commit credentials to version control

## Changing the Password

### Method 1: Update Connection Profile

1. Edit `~/hyperledger/blockchain-explorer/examples/net1/connection-profile/node2ai-network.json`
2. Change the `password` field in `adminCredential`
3. Restart Explorer:
   ```bash
   cd ~/hyperledger/blockchain-explorer
   docker-compose restart
   ```

### Method 2: Environment Variables

1. Set environment variable in `.env`:

   ```bash
   EXPLORER_ADMIN_PASSWORD=your-secure-password
   ```

2. Update connection profile to use environment variable:
   ```json
   {
     "client": {
       "adminCredential": {
         "id": "exploreradmin",
         "password": "${EXPLORER_ADMIN_PASSWORD}"
       }
     }
   }
   ```

## Related Documentation

- **Setup Guide**: `~/hyperledger/blockchain-explorer/NODE2AI-SETUP.md`
- **Main Architecture**: `docs/ARCHITECTURE.md`
- **Blockchain Setup**: `blockchain/PRODUCTION_SETUP.md`

## Quick Reference

```bash
# Access Explorer
open http://localhost:8090

# Login
Username: exploreradmin
Password: exploreradminpw
```

---

**Last Updated**: November 2025  
**Version**: 1.0
