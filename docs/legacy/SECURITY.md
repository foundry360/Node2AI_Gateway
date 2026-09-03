# Node2AI Security Best Practices Guide

## Overview

Node2AI is built with a **security-first design philosophy**, implementing enterprise-grade security measures to protect your data, API keys, and AI interactions. This guide covers comprehensive security practices, compliance requirements, and operational procedures to ensure your Node2AI deployment meets the highest security standards.

### Security-First Design Philosophy

- **Zero Trust Architecture**: Never trust, always verify
- **Defense in Depth**: Multiple layers of security controls
- **Least Privilege Access**: Minimum required permissions
- **Encryption Everywhere**: Data at rest and in transit
- **Continuous Monitoring**: Real-time threat detection
- **Regular Auditing**: Periodic security assessments

### Shared Responsibility Model

| Component                   | Node2AI Responsibility                     | Your Responsibility                      |
| --------------------------- | ------------------------------------------ | ---------------------------------------- |
| **Infrastructure Security** | ✅ Server hardening, network security      | ✅ Network configuration, firewall rules |
| **Application Security**    | ✅ Code security, vulnerability management | ✅ Secure deployment, configuration      |
| **Data Encryption**         | ✅ Encryption at rest and in transit       | ✅ Key management, access controls       |
| **Authentication**          | ✅ Secure auth system, MFA support         | ✅ Strong passwords, MFA enablement      |
| **API Security**            | ✅ Rate limiting, input validation         | ✅ API key management, usage monitoring  |
| **Compliance**              | ✅ SOC 2, ISO 27001 infrastructure         | ✅ Policy compliance, audit readiness    |
| **Incident Response**       | ✅ Security monitoring, alerting           | ✅ Incident response, communication      |

### Compliance Frameworks Supported

- **SOC 2 Type II**: Security, availability, confidentiality
- **ISO 27001**: Information security management
- **GDPR**: Data protection and privacy
- **CCPA**: California Consumer Privacy Act
- **HIPAA**: Healthcare data protection (with proper configuration)

### Security Contact

- **General Security**: security@foundry360.com
- **Vulnerability Reports**: security@foundry360.com
- **Incident Response**: incident@foundry360.com
- **Privacy Concerns**: privacy@foundry360.com
- **Compliance Questions**: compliance@foundry360.com

## Executive Summary

### Node2AI Security Commitment

**Enterprise-Grade Security:**

- **AES-256-GCM encryption** for all sensitive data
- **Zero-trust architecture** with comprehensive access controls
- **Regular security audits** and penetration testing
- **OWASP Top 10 compliance** with secure coding practices
- **ISO 27001 certified** infrastructure and processes
- **SOC 2 Type II compliant** with annual audits

**Security Features:**

- Multi-factor authentication (MFA) support
- Role-based access control (RBAC)
- Comprehensive audit logging
- Real-time security monitoring
- Automated threat detection
- Incident response automation

### Your Responsibilities

**Critical Security Tasks:**

- **Secure credentials management** (passwords, API keys)
- **Network security configuration** (firewalls, VPNs)
- **Access control policies** (user roles, permissions)
- **Regular security reviews** (quarterly assessments)
- **Incident response planning** (preparedness, training)
- **Employee security training** (awareness, best practices)

**Ongoing Security Maintenance:**

- Password rotation and management
- API key lifecycle management
- Provider key security
- Access review and cleanup
- Security monitoring and alerting
- Compliance documentation

## Authentication & Authorization

### Password Security

#### Password Requirements

**Enforced by Node2AI:**

```
Minimum 12 characters
At least 1 uppercase letter
At least 1 lowercase letter
At least 1 number
At least 1 special character (!@#$%^&*)
Cannot contain username or email
Cannot be in common password list (10M+ entries)
Cannot reuse last 5 passwords
Password age: 90 days (configurable)
Account lockout: 5 failed attempts in 10 minutes
```

#### Strong Password Examples

**✅ Good Passwords:**

```
M7#kL9@pQ2$nR4!tS8
Quantum-Computing-2024!
MyD0g$Name&B1rthYear!
Tr0ub4dor&3
C0mpl3x!ty&Str3ngth
```

**❌ Bad Passwords:**

```
password123
admin@123
node2ai2024
12345678
qwerty123
letmein
```

#### Password Generation

**Cryptographically Secure:**

```bash
# Generate secure random password
openssl rand -base64 32

# Generate memorable passphrase
diceware --num-words 6 --delimiter "-"
# Output: correct-horse-battery-staple-quantum-robot

# Using pwgen
pwgen -s 16 1
# Output: Kx9mP2nQ5rS8tU1v
```

#### Password Management Best Practices

**✅ Do:**

- Use a password manager (1Password, LastPass, Bitwarden, Keeper)
- Enable MFA/2FA on all accounts (including provider accounts)
- Use unique passwords for each service
- Never share passwords via email, Slack, or other channels
- Change passwords immediately if compromise suspected
- Use long passphrases over complex short passwords
- Enable password manager browser extensions for auto-fill

**❌ Don't:**

- Never write passwords on paper or sticky notes
- Don't store passwords in plain text files
- Don't use personal information (birthdays, names, etc.)
- Don't reuse passwords across services
- Don't share accounts - create individual accounts instead

#### Default Credentials - MUST CHANGE IMMEDIATELY

**⚠️ CRITICAL: Change these on first login!**

```
Admin User:
Email: admin@node2ai.ai
Password: admin123

Developer User:
Email: developer@node2ai.ai
Password: dev123

Viewer User:
Email: viewer@node2ai.ai
Password: view123

Auditor User:
Email: auditor@node2ai.ai
Password: audit123
```

#### Password Rotation Policy

**Recommended Schedule:**

```
Production admin accounts: Every 60 days
Standard user accounts: Every 90 days
Service accounts: Every 180 days
Immediate rotation if:
  * Compromise suspected
  * Employee departure
  * Security incident
  * Shared account discovered
```

#### Password Hashing

**Node2AI Implementation:**

```
Algorithm: bcrypt
Salt rounds: 12 (2^12 = 4,096 iterations)
Password never stored in plain text
Password never logged or transmitted
Password verification happens server-side only
```

### Multi-Factor Authentication (MFA)

#### MFA Methods Supported

**1. TOTP (Time-based One-Time Password)**

- Apps: Google Authenticator, Authy, 1Password, Microsoft Authenticator
- 6-digit codes rotate every 30 seconds
- Most secure and recommended

**2. SMS (Text Message)**

- Backup method only
- Less secure due to SIM swapping attacks
- Better than no MFA

**3. Email**

- Backup method only
- Requires secure email access
- Use for account recovery

**4. Hardware Keys (FIDO2/WebAuthn)**

- YubiKey, Titan Security Key
- Most secure option
- Resistant to phishing

#### Enabling MFA

```
1. Login to Node2AI
2. Navigate to Settings → Security
3. Click "Enable Two-Factor Authentication"
4. Scan QR code with authenticator app
5. Enter 6-digit code to verify
6. Save backup codes in secure location
7. Test MFA before closing settings
```

#### MFA Backup Codes

**⚠️ IMPORTANT: Store these securely!**

When you enable MFA, you receive 10 backup codes. Each code can be used once if you lose access to your MFA device.

**Storage recommendations:**

- Password manager (encrypted)
- Printed and stored in safe/lockbox
- Encrypted USB drive in secure location

**❌ DO NOT store in:**

- Plain text file on computer
- Unencrypted cloud storage
- Email
- Screenshots

### API Key Security

#### API Key Generation

```bash
# Generate cryptographically secure API key
openssl rand -base64 32

# Node2AI format
node2ai-key-<environment>-<random>

Examples:
node2ai-key-prod-a8f3d92k1m4p7q9s2t5u
node2ai-key-staging-x1y2z3a4b5c6d7e8f9g0
node2ai-key-dev-m9n8b7v6c5x4z3a2s1d0
```

#### API Key Storage Best Practices

```bash
# ✅ Good: Environment variables
export NODE2AI_API_KEY="node2ai-key-prod-..."

# ✅ Good: .env file (add to .gitignore)
NODE2AI_API_KEY=node2ai-key-prod-...

# ✅ Good: Secrets manager
aws secretsmanager get-secret-value --secret-id node2ai-api-key

# ❌ Bad: Hardcoded in source code
const apiKey = 'node2ai-key-prod-...'; // NEVER DO THIS

# ❌ Bad: Committed to git
git add .env  # NEVER COMMIT .ENV FILES
```

#### API Key Permissions

**Principle of Least Privilege - Grant only necessary permissions:**

```
Read-Only Key (Analytics):
- Permissions: ['analytics:read', 'usage:read']
- Use case: Dashboard, reporting, monitoring

Developer Key (Chat):
- Permissions: ['chat:write', 'analytics:read']
- Use case: Application integration, testing

Admin Key (Full Access):
- Permissions: ['*']
- Use case: Administration, automation, CI/CD
- ⚠️ Limit usage - only for trusted systems
```

#### API Key Rotation

**Rotation Schedule:**

```
Production keys: Every 90 days
Development keys: Every 180 days
Compromised keys: IMMEDIATELY
```

**Zero-Downtime Rotation Process:**

```
1. Generate new API key in Node2AI
2. Add new key to application (parallel with old)
3. Test new key thoroughly
4. Monitor for 24-48 hours
5. Switch primary traffic to new key
6. Remove old key from application
7. Revoke old key in Node2AI
8. Update documentation
```

#### API Key Monitoring

**Monitor for:**

- Usage from unexpected IP addresses
- Unusual request patterns (volume, timing)
- Failed authentication attempts
- Geographic anomalies
- Permission escalation attempts

**Set up alerts for:**

- New IP address usage
- Rate limit hits
- 401/403 errors spike
- Weekend/off-hours usage (if unexpected)

### Role-Based Access Control (RBAC)

#### Role Hierarchy

```
Admin (Full Control)
├── User management (create, edit, delete)
├── Organization settings
├── Provider key management
├── Billing and subscriptions
├── Audit log access
└── All lower role permissions

Developer (Development & Operations)
├── Provider key management
├── Chat and API usage
├── Analytics access
├── API key creation
└── Read-only user list

Viewer (Read-Only)
├── Analytics dashboards
├── Usage reports
├── Cost reports
└── Own profile management

Auditor (Compliance & Security)
├── Audit log access
├── Analytics access
├── Usage reports
├── Compliance reports
└── Read-only access to settings
```

#### Permission Matrix

| Resource            | Admin | Developer | Viewer | Auditor |
| ------------------- | :---: | :-------: | :----: | :-----: |
| **User Management** |
| Create users        |  ✅   |    ❌     |   ❌   |   ❌    |
| Edit users          |  ✅   |    ❌     |   ❌   |   ❌    |
| Delete users        |  ✅   |    ❌     |   ❌   |   ❌    |
| View users          |  ✅   |    👁️     |   ❌   |   👁️    |
| **Provider Keys**   |
| Add keys            |  ✅   |    ✅     |   ❌   |   ❌    |
| Edit keys           |  ✅   |    ✅     |   ❌   |   ❌    |
| Delete keys         |  ✅   |    ✅     |   ❌   |   ❌    |
| Test keys           |  ✅   |    ✅     |   ❌   |   ❌    |
| View keys (masked)  |  ✅   |    ✅     |   👁️   |   👁️    |
| **Chat & API**      |
| Send messages       |  ✅   |    ✅     |   ❌   |   ❌    |
| API access          |  ✅   |    ✅     |   ❌   |   ❌    |
| **Analytics**       |
| View analytics      |  ✅   |    ✅     |   ✅   |   ✅    |
| Export reports      |  ✅   |    ✅     |   ✅   |   ✅    |
| **Audit Logs**      |
| View logs           |  ✅   |    ❌     |   ❌   |   ✅    |
| Export logs         |  ✅   |    ❌     |   ❌   |   ✅    |
| **Organization**    |
| Edit settings       |  ✅   |    ❌     |   ❌   |   ❌    |
| Manage billing      |  ✅   |    ❌     |   ❌   |   ❌    |
| View settings       |  ✅   |    👁️     |   👁️   |   👁️    |

**Legend:** ✅ Full access | 👁️ Read-only | ❌ No access

#### Best Practices

**✅ Do:**

- Assign minimum required role for each user
- Review access quarterly
- Remove access immediately when employee leaves
- Use service accounts for automation (not personal accounts)
- Audit role changes
- Document role assignment decisions

**❌ Don't:**

- Never share accounts
- Don't use admin role for daily tasks
- Don't grant admin "just in case"

### Session Management

#### Session Security

**JWT Token Configuration:**

```
Expiration: 24 hours (configurable)
Refresh token: 7 days
Secure flag: true (HTTPS only)
HttpOnly: true (not accessible via JavaScript)
SameSite: Strict (CSRF protection)
Token rotation: On each refresh
```

#### Session Best Practices

**✅ Do:**

- Always logout when finished
- Don't save "Remember Me" on shared computers
- Clear browser data when using public computers
- Monitor active sessions in settings
- Terminate suspicious sessions immediately

**❌ Don't:**

- Don't share session tokens
- Don't extend session timeout beyond 24 hours

## Data Encryption

### Encryption at Rest

#### What is Encrypted

```
✅ Provider API keys (AES-256-GCM)
✅ User passwords (bcrypt with 12 rounds)
✅ Authentication tokens (encrypted)
✅ Sensitive user data (PII)
✅ Chat messages (optional, configurable)
✅ Audit logs
✅ Database backups
✅ File uploads
```

#### Encryption Standards

```
Algorithm: AES-256-GCM
- 256-bit key length
- Galois/Counter Mode (authenticated encryption)
- Random initialization vectors (IV)
- Authentication tags for integrity

Key Derivation: PBKDF2
- 100,000 iterations
- SHA-256 hash function
- 32-byte output
```

#### Provider API Key Encryption

```typescript
// Encryption process
const encryptProviderKey = (plainKey: string) => {
  // 1. Generate random IV (16 bytes)
  const iv = crypto.randomBytes(16);

  // 2. Derive encryption key from master key
  const key = deriveKey(MASTER_KEY, iv);

  // 3. Create cipher
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  // 4. Encrypt
  let encrypted = cipher.update(plainKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // 5. Get authentication tag
  const authTag = cipher.getAuthTag();

  // 6. Format: iv:encrypted:authTag
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`;
};

// Stored format in database
// Example: a1b2c3...f0:8h9i0j...x8:p9q0r1...z6
//          ^IV      ^Encrypted  ^Auth Tag
```

#### Encryption Key Management

**Master Keys:**

- Stored in environment variables (not in database)
- Rotated annually
- Backed up in Hardware Security Module (HSM)
- Access logged and monitored

**Recommended Key Storage:**

- AWS KMS (Key Management Service)
- HashiCorp Vault
- Azure Key Vault
- Google Cloud KMS
- Hardware Security Module (HSM)

**❌ Never store encryption keys:**

- In source code
- In database
- In plain text files
- In version control

#### Database Encryption

**PostgreSQL Encryption:**

```
Transparent Data Encryption (TDE) enabled
All tables encrypted at rest
Transaction logs encrypted
Temporary files encrypted

Configuration:
postgresql.conf:
  ssl = on
  ssl_cert_file = '/path/to/server.crt'
  ssl_key_file = '/path/to/server.key'
  ssl_ca_file = '/path/to/ca.crt'
```

### Encryption in Transit

#### TLS/SSL Configuration

```nginx
# Nginx configuration
server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # TLS configuration
    ssl_protocols TLSv1.3 TLSv1.2;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384';
    ssl_prefer_server_ciphers on;

    # HSTS (HTTP Strict Transport Security)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;

    # Certificate configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_trusted_certificate /etc/letsencrypt/live/yourdomain.com/chain.pem;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;

    # Session configuration
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

#### Certificate Management

```bash
# Let's Encrypt (Free SSL certificates)
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d api.yourdomain.com

# Auto-renewal (cron job)
0 0 * * * certbot renew --quiet

# Test SSL configuration
https://www.ssllabs.com/ssltest/
```

#### Internal Communication Encryption

```
All service-to-service communication encrypted:

API ←TLS 1.3→ Database
API ←TLS 1.3→ Redis
API ←TLS 1.3→ Provider APIs
Web ←TLS 1.3→ API

Mutual TLS (mTLS) for service mesh:
- Each service has own certificate
- Certificates validated both ways
- Automatic certificate rotation
```

## Provider API Key Security

### Secure Storage Architecture

#### Multi-Layer Security

```
Layer 1: Encryption at Rest
└── Provider keys encrypted with AES-256-GCM

Layer 2: Key Segregation
└── Encryption keys stored separately from data

Layer 3: Access Control
└── Only authorized roles can access keys

Layer 4: Audit Logging
└── All key operations logged

Layer 5: Runtime Decryption
└── Keys decrypted only when needed, never cached
```

#### Key Lifecycle

```
1. Creation
   - User adds provider key via dashboard/API
   - Key validated (format, length)
   - Key encrypted with AES-256-GCM
   - Encrypted key stored in database
   - Event logged to audit trail

2. Storage
   - Encrypted keys in PostgreSQL
   - Master encryption keys in KMS/HSM
   - Database backups encrypted
   - No plain text keys anywhere

3. Usage
   - Application requests provider key
   - Authorization check (role, permissions)
   - Key retrieved from database (encrypted)
   - Key decrypted in memory
   - Used for AI provider API call
   - Immediately discarded (not cached)
   - Usage logged

4. Rotation
   - New key generated at provider
   - New key added to Node2AI
   - Traffic gradually shifted
   - Old key disabled after grace period
   - Old key revoked at provider
   - Old key deleted from Node2AI

5. Deletion
   - Key marked as deleted (soft delete)
   - Grace period (7 days for recovery)
   - Permanent deletion after grace period
   - Deletion logged in audit trail
```

#### Access Control

**Who Can Access Provider Keys:**

```
✅ Admins: Full access (add, edit, delete, view masked)
✅ Developers: Full access (add, edit, delete, view masked)
❌ Viewers: No access
❌ Auditors: View masked keys only (for compliance)

Keys are NEVER:
- Sent to browser/client
- Logged (even in errors)
- Included in error messages
- Exported in bulk
- Accessible via public API
```

### Usage Monitoring

#### Real-Time Monitoring

**Track for Each Key:**

- Total requests count
- Requests per time period
- Token usage
- Cost accumulation
- Error rates
- Response latency
- Geographic distribution of requests
- IP addresses used

#### Anomaly Detection

**Alert on:**

- Sudden spike in usage (>200% normal)
- Usage from new IP address
- Usage from unexpected geographic location
- High error rate (>10%)
- Failed provider authentication
- Usage outside business hours (if unusual)
- Multiple providers failing simultaneously
- Unusual model requests

#### Automated Response

**If Suspicious Activity Detected:**

```
1. Immediate email alert to admins
2. Slack/webhook notification
3. Optional: Auto-disable key
4. Log incident details
5. Create security event
6. Require manual review before re-enabling
```

### Key Rotation Best Practices

#### Why Rotate Keys

- Limit exposure window
- Compliance requirements (SOC 2, ISO 27001)
- Suspected compromise
- Team member departure
- Periodic security hygiene
- Provider security incident

#### Rotation Frequency

```
Critical Production Keys: 30 days
Standard Production Keys: 90 days
Development Keys: 180 days
Compromised Keys: IMMEDIATELY
```

#### Automated Rotation (Roadmap)

```json
// Future feature - automatic key rotation
{
  "autoRotation": {
    "enabled": true,
    "schedule": "90 days",
    "notifyBefore": "7 days",
    "gracePeriod": "7 days"
  }
}

Process:
1. Node2AI generates new key at provider (API)
2. New key added to Node2AI automatically
3. Email notification to admins
4. 7-day parallel testing period
5. Traffic switched to new key
6. Old key disabled after 7 days
7. Old key revoked at provider
```

## Network Security

### Firewall Configuration

#### Required Ports

```
Inbound (Public):
- 443/tcp (HTTPS) - Web and API traffic
- 80/tcp (HTTP) - Redirect to HTTPS only

Inbound (Private Network Only):
- 5432/tcp (PostgreSQL) - Database access
- 6379/tcp (Redis) - Cache access
- 22/tcp (SSH) - Server management (VPN only)

Outbound:
- 443/tcp (HTTPS) - AI provider APIs
- 53/tcp+udp (DNS) - Name resolution
- 123/udp (NTP) - Time synchronization
```

#### Firewall Rules (iptables)

```bash
# Allow loopback
iptables -A INPUT -i lo -j ACCEPT

# Allow established connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow HTTPS
iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow HTTP (for redirect)
iptables -A INPUT -p tcp --dport 80 -j ACCEPT

# Allow SSH from specific IP
iptables -A INPUT -p tcp -s 10.0.0.0/8 --dport 22 -j ACCEPT

# Allow PostgreSQL from app servers only
iptables -A INPUT -p tcp -s 10.0.1.0/24 --dport 5432 -j ACCEPT

# Drop everything else
iptables -P INPUT DROP
iptables -P FORWARD DROP

# Allow all outbound
iptables -P OUTPUT ACCEPT
```

#### AWS Security Groups

```yaml
# Web/API tier
WebSecurityGroup:
  IngressRules:
    - Port: 443
      Source: 0.0.0.0/0 # Public internet
    - Port: 80
      Source: 0.0.0.0/0 # HTTP redirect
  EgressRules:
    - Port: 0-65535
      Destination: 0.0.0.0/0 # Allow all outbound

# Database tier
DatabaseSecurityGroup:
  IngressRules:
    - Port: 5432
      Source: WebSecurityGroup # Only from web tier
  EgressRules:
    - Port: 0-65535
      Destination: VPCCidr # Internal only
```

### DDoS Protection

#### Defense Layers

```
Layer 1: CDN/WAF (Cloudflare, AWS WAF)
└── Filter malicious traffic before reaching servers

Layer 2: Load Balancer
└── Distribute traffic across multiple servers

Layer 3: Application Rate Limiting
└── Node2AI built-in rate limiting

Layer 4: Database Connection Pooling
└── Prevent database exhaustion
```

#### Rate Limiting Configuration

```env
# Per IP address
RATE_LIMIT_IP_WINDOW=60000  # 1 minute
RATE_LIMIT_IP_MAX=100       # 100 requests per minute

# Per API key
RATE_LIMIT_KEY_WINDOW=60000
RATE_LIMIT_KEY_MAX=300      # Based on role

# Per organization
RATE_LIMIT_ORG_WINDOW=3600000  # 1 hour
RATE_LIMIT_ORG_MAX=10000       # 10K requests per hour

# Burst allowance
RATE_LIMIT_BURST=20  # Allow 20 request burst
```

#### DDoS Mitigation

**Detection:**

- Sudden traffic spike (>500% normal)
- High number of 4xx errors
- Single IP excessive requests
- Unusual geographic distribution

**Response:**

```
1. Enable aggressive rate limiting
2. Block suspicious IPs
3. Enable CAPTCHA for web traffic
4. Scale infrastructure if needed
5. Contact CDN provider
6. Monitor and adjust
```

### CORS Configuration

#### Secure CORS Setup

```typescript
// apps/api/src/middleware/cors.ts
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);

    // Check against whitelist
    const allowedOrigins = process.env.CORS_ORIGINS.split(',');

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-API-Key',
    'X-Request-ID',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  maxAge: 86400, // 24 hours
};
```

#### Environment Configuration

```env
# Development
CORS_ORIGINS=http://localhost:3000,http://localhost:3001

# Production
CORS_ORIGINS=https://app.yourdomain.com,https://admin.yourdomain.com

# ❌ NEVER in production
CORS_ORIGINS=*  # Allows ALL origins - security risk!
```

### VPC and Network Isolation

#### Network Architecture

```
Internet
   │
   ↓
[CDN/WAF]
   │
   ↓
[Load Balancer] (Public Subnet)
   │
   ↓
[Web/API Servers] (Private Subnet)
   │
   ↓
[Database/Redis] (Private Subnet - No Internet)
```

#### Private Subnet Configuration

```
Database Subnet:
- No internet gateway
- No public IP addresses
- Accessible only from app subnet
- NAT gateway for outbound updates only
```

## Audit Logging & Monitoring

### What Gets Logged

#### Security Events (Always Logged)

```
Authentication:
- Login attempts (success/failure)
- Logout events
- Password changes
- MFA enable/disable
- MFA code usage
- Session creation/destruction
- Token refresh

Authorization:
- Permission denied events
- Role changes
- Access to sensitive resources
- Privilege escalation attempts

API Keys:
- Node2AI API key creation
- Node2AI API key deletion
- Node2AI API key usage
- Provider key addition
- Provider key deletion
- Provider key testing
- Provider key rotation

Data Access:
- User profile views
- Analytics access
- Export operations
- Bulk operations
- Sensitive data queries

Administrative:
- User creation/deletion
- Organization changes
- System configuration changes
- Billing changes
- Integration changes
```

#### Audit Log Format

```json
{
  "id": "log-550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2024-01-15T10:30:00.123Z",
  "eventType": "auth.login.success",
  "severity": "info",
  "actor": {
    "userId": "user-uuid",
    "email": "user@example.com",
    "role": "admin",
    "ipAddress": "192.168.1.100",
    "userAgent": "Mozilla/5.0...",
    "geolocation": {
      "country": "US",
      "region": "CA",
      "city": "San Francisco"
    }
  },
  "resource": {
    "type": "user",
    "id": "user-uuid",
    "organizationId": "org-uuid"
  },
  "action": "login",
  "result": "success",
  "metadata": {
    "authMethod": "password+mfa",
    "mfaMethod": "totp",
    "sessionId": "session-uuid"
  },
  "changes": null // For modification events
}
```

### Log Retention

#### Retention Policies

```
Security Events: 2 years (compliance requirement)
Audit Logs: 2 years (SOC 2, ISO 27001)
System Logs: 90 days
Access Logs: 30 days
Debug Logs: 7 days (development only)

Storage:
- Hot storage: Last 30 days (fast access)
- Warm storage: 31-365 days (standard access)
- Cold storage: 1-2 years (archive, slower access)
- Glacier: >2 years (compliance backup)
```

#### Log Archival

```bash
# Daily backup to S3
0 2 * * * /scripts/backup-logs.sh

# Script contents
#!/bin/bash
DATE=$(date +%Y-%m-%d)

# Export logs
pg_dump -t audit_logs node2ai > /tmp/audit-$DATE.sql

# Compress
gzip /tmp/audit-$DATE.sql

# Upload to S3
aws s3 cp /tmp/audit-$DATE.sql.gz \
  s3://node2ai-audit-logs/$DATE/ \
  --storage-class GLACIER

# Cleanup
rm /tmp/audit-$DATE.sql.gz
```

### Log Monitoring

#### Real-Time Monitoring

**Tools:**

- ELK Stack (Elasticsearch, Logstash, Kibana)
- Splunk
- Datadog
- New Relic
- CloudWatch Logs (AWS)

**Dashboards:**

- Security events timeline
- Failed login attempts
- API key usage
- Error rates
- Response times
- Cost tracking

#### Alert Configuration

```yaml
alerts:
  - name: 'Multiple Failed Logins'
    condition: 'failed_logins > 5 in 10 minutes from same IP'
    action: ['email_admins', 'block_ip', 'create_incident']
    severity: 'high'

  - name: 'Privilege Escalation Attempt'
    condition: "event_type = 'role_change' AND new_role = 'admin'"
    action: ['email_security_team', 'require_approval']
    severity: 'critical'

  - name: 'Unusual API Key Usage'
    condition: 'api_key_requests > 1000% of average from new IP'
    action: ['email_admins', 'disable_key', 'create_incident']
    severity: 'high'

  - name: 'Provider Key Test Failed'
    condition: "provider_test = 'failed'"
    action: ['email_key_owner', 'create_ticket']
    severity: 'medium'

  - name: 'High Error Rate'
    condition: 'error_rate > 10% for 5 minutes'
    action: ['page_oncall', 'auto_scale']
    severity: 'critical'
```

### Security Information and Event Management (SIEM)

#### SIEM Integration

**Supported SIEM Platforms:**

- Splunk
- IBM QRadar
- ArcSight
- LogRhythm
- Sumo Logic

**Integration Methods:**

- Syslog forwarding
- REST API
- S3 bucket export
- Webhook notifications

#### SIEM Use Cases

```
1. Threat Detection
   - Brute force attacks
   - Credential stuffing
   - API abuse
   - Data exfiltration attempts

2. Compliance Reporting
   - SOC 2 audit trails
   - GDPR data access logs
   - HIPAA audit logs
   - ISO 27001 evidence

3. Incident Response
   - Timeline reconstruction
   - Impact analysis
   - Forensic investigation
   - Root cause analysis

4. Behavioral Analytics
   - User behavior baseline
   - Anomaly detection
   - Insider threat detection
   - Compromised account detection
```

## Incident Response

### Incident Types

#### Security Incidents

**Critical (P0):**

- Data breach (unauthorized access to customer data)
- System compromise (attacker access to production)
- Ransomware attack
- Complete service outage
- Mass account compromise

**High (P1):**

- Individual account compromise
- API key leak
- Provider key exposure
- DDoS attack
- Significant data loss

**Medium (P2):**

- Brute force attempt (blocked)
- Failed privilege escalation
- Suspicious activity (contained)
- Configuration error (security impact)

**Low (P3):**

- Failed login attempts
- Minor vulnerability discovered
- Security policy violation
- Non-critical misconfigurations

### Response Procedures

#### Immediate Actions (0-15 minutes)

```
1. ASSESS
   - Confirm incident is real (not false positive)
   - Determine severity level
   - Identify affected systems/users
   - Document initial findings

2. CONTAIN
   - Isolate affected systems
   - Revoke compromised credentials
   - Disable compromised API keys
   - Block malicious IP addresses
   - Enable enhanced logging

3. NOTIFY
   - Security team immediately
   - Management (P0/P1 incidents)
   - Legal counsel (data breach)
   - Prepare stakeholder communication
```

#### Short-Term Actions (15 minutes - 4 hours)

```
4. INVESTIGATE
   - Review audit logs
   - Analyze attack vectors
   - Identify root cause
   - Determine scope of compromise
   - Collect forensic evidence

5. ERADICATE
   - Remove malware/backdoors
   - Patch vulnerabilities
   - Close attack vectors
   - Reset compromised credentials
   - Restore from clean backups

6. COMMUNICATE
   - Update stakeholders
   - Prepare customer notification (if required)
   - Coordinate with law enforcement (if needed)
   - Document progress
```

#### Long-Term Actions (4 hours - 7 days)

```
7. RECOVER
   - Restore normal operations
   - Verify system integrity
   - Monitor for re-compromise
   - Implement additional controls
   - Update security policies

8. DOCUMENT
   - Complete incident report
   - Timeline of events
   - Impact assessment
   - Lessons learned
   - Remediation actions

9. FOLLOW-UP
   - Notify affected parties
   - Regulatory reporting (if required)
   - Insurance claims (if applicable)
   - Post-mortem meeting
   - Update incident response plan
```

### Communication Plan

#### Internal Communication

```
Immediate (within 15 minutes):
- Security team via PagerDuty/Slack
- CTO/CISO notification
- Incident response team assembly

Within 1 hour:
- Executive team (CEO, CFO, CLO)
- Engineering leadership
- Support team (if customer-facing)

Within 4 hours:
- All employees (if significant)
- Board of directors (if material)
- Insurance provider
```

#### External Communication

```
Customer Notification Timeline:
- Data breach: Within 72 hours (GDPR requirement)
- Service outage: Immediate (status page)
- Security vulnerability: After patch available

Regulatory Notification:
- GDPR: 72 hours to supervisory authority
- CCPA: Without unreasonable delay
- HIPAA: 60 days for breaches >500 individuals
- SOC 2: Report in next audit
```

#### Communication Templates

```
Subject: [URGENT] Security Incident - Node2AI

Dear [Customer],

We are writing to inform you of a security incident that occurred on [DATE].

What Happened:
[Brief description of incident]

What Information Was Involved:
[Specific data types affected]

What We Are Doing:
[Containment and remediation actions]

What You Should Do:
- Change your Node2AI password immediately
- Enable two-factor authentication
- Review recent account activity
- Monitor for suspicious emails/calls

For More Information:
security-incident@foundry360.com
[Incident ID: INC-2024-001]

We sincerely apologize for any inconvenience.

Node2AI Security Team
Foundry360
```

### Incident Response Team

#### Team Structure

```
Incident Commander (IC)
- Overall coordination
- Decision making authority
- Stakeholder communication

Security Lead
- Technical investigation
- Threat analysis
- Forensics coordination

Engineering Lead
- System restoration
- Patch deployment
- Infrastructure changes

Communications Lead
- Internal communications
- Customer notifications
- Media relations

Legal Counsel
- Regulatory compliance
- Liability assessment
- Law enforcement liaison

Customer Support Lead
- Customer inquiries
- Support ticket triage
- FAQ preparation
```

#### On-Call Rotation

```
24/7 Coverage:
- Primary on-call: Immediate response
- Secondary on-call: Backup (15 min SLA)
- Escalation: Management (30 min SLA)

Tools:
- PagerDuty / Opsgenie
- Slack #security-incidents channel
- Zoom war room
- Incident management platform
```

## Compliance & Regulations

### GDPR Compliance

#### Key Requirements

```
Data Minimization:
- Collect only necessary data
- Define retention periods
- Automatic data deletion

User Rights:
- Right to access (data export)
- Right to erasure (account deletion)
- Right to rectification (data correction)
- Right to portability (data download)
- Right to object (opt-out)

Consent Management:
- Explicit consent for data processing
- Easy withdrawal of consent
- Record of consent

Data Protection:
- Encryption at rest and in transit
- Access controls
- Audit logging
- DPO (Data Protection Officer) appointed

Breach Notification:
- 72-hour notification to supervisory authority
- Individual notification if high risk
- Documentation of breaches
```

#### Implementation in Node2AI

```
Data Export (Right to Access):
GET /api/v1/user/data-export
- Returns all user data in JSON format
- Includes: profile, chat history, usage data
- Excludes: other users' data, system data

Account Deletion (Right to Erasure):
DELETE /api/v1/user/account
- 30-day grace period
- Anonymizes data (where retention required)
- Deletes personal data
- Notifies user of completion

Consent Management:
POST /api/v1/user/consents
- Marketing emails: opt-in/opt-out
- Analytics tracking: opt-in/opt-out
- Third-party sharing: opt-in/opt-out
- Records consent timestamp
```

### CCPA Compliance

#### Consumer Rights

```
- Right to know (what data collected)
- Right to delete
- Right to opt-out of data sale
- Right to non-discrimination

Implementation:
- "Do Not Sell My Personal Information" link
- Privacy policy disclosure
- Verified request process
- 45-day response timeline
```

### SOC 2 Compliance

#### Trust Service Criteria

```
Security:
- Access controls
- Logical and physical access restrictions
- System operations
- Change management
- Risk mitigation

Availability:
- Performance monitoring
- Incident management
- Backup and recovery
- Capacity planning

Processing Integrity:
- System processing
- Data quality
- Processing authorization

Confidentiality:
- Data classification
- Encryption
- Access restrictions

Privacy:
- Notice and choice
- Collection and use
- Access and correction
- Disclosure and notification
```

#### Evidence Collection

```
- Access control logs
- Change management records
- Security awareness training records
- Vendor management documentation
- Incident response logs
- Backup verification reports
- Penetration test results
- Vulnerability scan reports
```

### HIPAA Compliance (if applicable)

#### Requirements

```
Administrative Safeguards:
- Security management process
- Workforce training
- Access authorization
- Contingency plan

Physical Safeguards:
- Facility access controls
- Workstation security
- Device and media controls

Technical Safeguards:
- Access controls
- Audit controls
- Integrity controls
- Transmission security

Breach Notification:
- Individual notification
- HHS notification (if >500 affected)
- Media notification (if >500 in state)
```

#### Business Associate Agreements (BAA)

```
Required Elements:
- Permitted uses and disclosures
- Safeguard requirements
- Breach notification obligations
- Return/destruction of PHI
- Subcontractor agreements

Node2AI provides BAA for:
- Enterprise customers
- Healthcare organizations
- HIPAA-covered entities

Contact: legal@foundry360.com
```

## Security Checklist

### Initial Setup Checklist

```
Day 1 - Critical Security:
[ ] Change all default passwords
[ ] Generate strong JWT secret (32+ chars)
[ ] Generate encryption key (32 hex chars)
[ ] Enable HTTPS/TLS
[ ] Configure firewall rules
[ ] Set up database encryption
[ ] Enable audit logging
[ ] Configure CORS properly
[ ] Set up rate limiting
[ ] Review user roles and permissions

Week 1 - Enhanced Security:
[ ] Enable MFA for all users
[ ] Configure backup encryption
[ ] Set up monitoring alerts
[ ] Configure log aggregation
[ ] Document security procedures
[ ] Create incident response plan
[ ] Set up security scanning
[ ] Review API key permissions
[ ] Configure session management
[ ] Test backup restoration

Month 1 - Operational Security:
[ ] Complete security awareness training
[ ] Conduct first security review
[ ] Test incident response plan
[ ] Review access logs
[ ] Audit user accounts
[ ] Update security documentation
[ ] Schedule penetration test
[ ] Review vendor security
[ ] Implement SIEM integration
[ ] Create security metrics dashboard
```

### Monthly Security Tasks

```
User Management:
[ ] Review active users
[ ] Remove inactive accounts
[ ] Audit role assignments
[ ] Check for shared accounts
[ ] Review API key usage

System Security:
[ ] Review security logs
[ ] Check for failed logins
[ ] Review API key activity
[ ] Audit provider key usage
[ ] Check system updates
[ ] Review firewall rules
[ ] Verify backup integrity

Monitoring:
[ ] Review alert configurations
[ ] Check monitoring dashboards
[ ] Review incident reports
[ ] Analyze usage patterns
[ ] Review cost anomalies
```

### Quarterly Security Tasks

```
Access Review:
[ ] Full user access audit
[ ] API key inventory
[ ] Provider key rotation check
[ ] Review service accounts
[ ] Audit administrative access

Security Assessments:
[ ] Vulnerability scan
[ ] Penetration testing
[ ] Code security review
[ ] Dependency updates
[ ] Security policy review

Documentation:
[ ] Update security procedures
[ ] Review incident response plan
[ ] Update runbooks
[ ] Review business continuity plan
[ ] Update security training materials
```

### Annual Security Tasks

```
Comprehensive Security Audit:
[ ] Third-party security assessment
[ ] SOC 2 / ISO 27001 audit
[ ] Disaster recovery test
[ ] Business continuity test
[ ] Full penetration test
[ ] Social engineering test
[ ] Physical security review

Policy Updates:
[ ] Review and update all security policies
[ ] Update acceptable use policy
[ ] Review data classification policy
[ ] Update incident response plan
[ ] Review vendor management policy

Compliance:
[ ] GDPR compliance review
[ ] CCPA compliance review
[ ] SOC 2 renewal (if applicable)
[ ] ISO 27001 recertification (if applicable)
[ ] Insurance policy review
```

## Vulnerability Management

### Responsible Disclosure

#### Reporting Security Issues

```
Contact:
- Email: security@foundry360.com
- PGP Key: https://foundry360.com/security/pgp
- Bug Bounty: https://foundry360.com/bug-bounty (if available)

Expected Response Time:
- Initial response: 24 hours
- Triage: 48 hours
- Status updates: Every 7 days
- Resolution: Based on severity

What to Include:
- Description of vulnerability
- Steps to reproduce
- Potential impact
- Suggested remediation
- Your contact information
- PoC code (if applicable)
```

#### What NOT to Do

```
❌ Don't publicly disclose before resolution
❌ Don't exploit vulnerabilities
❌ Don't access data you don't own
❌ Don't perform destructive testing
❌ Don't social engineer employees
❌ Don't DDoS the service
```

#### Bug Bounty Program (if applicable)

```
Reward Ranges:
- Critical: $5,000 - $10,000
- High: $2,000 - $5,000
- Medium: $500 - $2,000
- Low: $100 - $500

Eligible Vulnerabilities:
- SQL injection
- Cross-site scripting (XSS)
- Authentication bypass
- Privilege escalation
- Remote code execution
- Data exposure

Out of Scope:
- Rate limiting bypass
- SPF/DKIM issues
- User enumeration
- Clickjacking
- Best practice violations
```

### Patch Management

#### Vulnerability Severity Levels

```
Critical (CVSS 9.0-10.0):
- Patch within 24 hours
- Emergency change process
- Immediate testing
- Deploy to production ASAP

High (CVSS 7.0-8.9):
- Patch within 7 days
- Expedited change process
- Test in staging first
- Schedule production deployment

Medium (CVSS 4.0-6.9):
- Patch within 30 days
- Standard change process
- Include in next release

Low (CVSS 0.1-3.9):
- Patch within 90 days
- Routine maintenance
- Bundle with other updates
```

#### Patch Process

```
1. IDENTIFY
   - Automated vulnerability scanning
   - Security advisories monitoring
   - Dependency checking
   - Vendor notifications

2. ASSESS
   - Determine severity
   - Assess exploitability
   - Evaluate impact
   - Prioritize patching

3. TEST
   - Apply patch to development
   - Run automated tests
   - Perform manual testing
   - Verify no regressions

4. DEPLOY
   - Schedule maintenance window
   - Apply to staging
   - Monitor for issues
   - Deploy to production
   - Verify patch success

5. VERIFY
   - Rescan for vulnerability
   - Confirm patch effective
   - Update inventory
   - Document changes
```

## Security Training

### Required Training

```
All Employees (Annually):
- Security awareness basics
- Phishing identification
- Password management
- Social engineering
- Incident reporting
- Data classification
- Acceptable use policy

Developers (Quarterly):
- Secure coding practices
- OWASP Top 10
- Code review guidelines
- Dependency management
- Security testing

Administrators (Quarterly):
- Access control management
- Audit log review
- Incident response
- Security tools usage
- Compliance requirements
```

### Security Resources

```
- OWASP: https://owasp.org
- SANS Security: https://www.sans.org
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework
- CIS Controls: https://www.cisecurity.org/controls
- Cloud Security Alliance: https://cloudsecurityalliance.org
```

## Security Metrics

### Key Performance Indicators

```
Security Metrics:
- Mean time to detect (MTTD)
- Mean time to respond (MTTR)
- Vulnerability patching time
- Failed login attempts
- Security incidents count
- Audit findings

Operational Metrics:
- Account compromise attempts
- API key rotation rate
- Provider key test failures
- MFA adoption rate
- Security training completion
- Policy compliance rate
```

## Contact & Resources

### Security Contacts

```
General Security: security@foundry360.com
Vulnerability Reports: security@foundry360.com
Incident Response: incident@foundry360.com
Privacy Concerns: privacy@foundry360.com
Compliance Questions: compliance@foundry360.com

Emergency Hotline: +1-XXX-XXX-XXXX (24/7)
```

### Documentation

```
- Installation Guide: docs/INSTALLATION.md
- Provider Keys Guide: docs/PROVIDER-KEYS.md
- API Documentation: docs/API.md
- FAQ: docs/FAQ.md
- Troubleshooting: docs/TROUBLESHOOTING.md
```

### External Resources

```
- Documentation: https://docs.foundry360.com/node2ai
- Status Page: https://status.foundry360.com
- Security Portal: https://security.foundry360.com
- Community Forum: https://community.foundry360.com
- GitHub: https://github.com/foundry360/node2ai
```

---

**Remember:** Security is a shared responsibility. While Node2AI provides enterprise-grade security infrastructure, your team's adherence to these best practices is crucial for maintaining a secure environment.

**Questions?** Contact our security team at security@foundry360.com for guidance on implementing these practices in your environment.
