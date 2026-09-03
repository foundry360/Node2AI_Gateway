# Node2AI FAQ - Frequently Asked Questions

## General Questions

### Q: What is Node2AI?

**A:** Node2AI is an enterprise AI orchestration platform that unifies multiple AI providers (OpenAI, Anthropic, Google, Perplexity) into a single interface. It uses a bring-your-own-key (BYOK) model, giving you full control over your AI provider accounts while providing powerful features like prompt sanitization, usage analytics, and cost tracking.

### Q: How is Node2AI different from using AI providers directly?

**A:** Node2AI provides:

- **Unified interface** for multiple AI providers
- **Automatic prompt sanitization** for data privacy
- **Comprehensive usage tracking** and cost analytics
- **Provider fallback** and load balancing
- **Enterprise features** (SSO, audit logging, RBAC)
- **Side-by-side model comparison**
- **Organization-wide cost controls**

### Q: What does BYOK (Bring Your Own Key) mean?

**A:** With BYOK, you provide your own API keys from AI providers (OpenAI, Anthropic, etc.). This means:

- You maintain **direct relationships** with providers
- You pay providers **directly** (transparent pricing)
- Your data **never goes through third-party middlemen**
- You control your **usage limits and spending**
- **No markup** on AI costs

### Q: Is Node2AI open source?

**A:** Node2AI core is open source under MIT license. Enterprise features and managed hosting are available with commercial licensing. See our [GitHub repository](https://github.com/foundry360/node2ai) for the source code.

### Q: Can I self-host Node2AI?

**A:** Yes! Node2AI can be self-hosted using:

- **Docker Compose** (recommended for single server)
- **Kubernetes** (recommended for production)
- **Manual installation** on Linux/macOS

See our [Installation Guide](./INSTALLATION.md) for details.

### Q: What are the system requirements?

**A:** **Minimum requirements:**

- 4GB RAM, 20GB disk space
- Docker 20.10+ and Docker Compose 2.0+
- Node.js 18+ and pnpm 8+
- PostgreSQL 14+

**Recommended for production:**

- 8GB RAM, 50GB disk space
- Load balancer (nginx, HAProxy)
- Redis for caching
- Regular backups

## Installation & Setup

### Q: How long does installation take?

**A:** Typical installation time:

- **Docker Compose:** 15-20 minutes
- **Manual installation:** 30-45 minutes
- **Kubernetes:** 45-60 minutes (including configuration)

### Q: Can I install Node2AI on Windows?

**A:** Yes, using Windows Subsystem for Linux (WSL2):

1. Install WSL2 with Ubuntu
2. Follow Linux installation instructions
3. Docker Desktop recommended for Windows

### Q: What databases are supported?

**A:** Currently **PostgreSQL 14+** only. Support for MySQL/MariaDB is on the roadmap.

### Q: Do I need Redis?

**A:** Redis is **optional but recommended** for:

- Session caching
- Rate limiting
- Real-time features
- Improved performance

Without Redis, Node2AI uses in-memory caching.

### Q: Can I use managed database services?

**A:** Yes! Node2AI works with:

- **AWS RDS** (PostgreSQL)
- **Google Cloud SQL** (PostgreSQL)
- **Azure Database** for PostgreSQL
- **Digital Ocean** Managed Databases
- **Heroku Postgres**

Just update `DATABASE_URL` in `.env`

### Q: How do I upgrade Node2AI?

**A:** Upgrade process:

```bash
# 1. Backup database
pg_dump node2ai > backup.sql

# 2. Pull latest code
git pull origin main

# 3. Update dependencies
pnpm install

# 4. Run migrations
pnpm run migrate

# 5. Restart services
docker-compose restart
```

### Q: Can I run multiple instances for high availability?

**A:** Yes! Deploy behind a load balancer:

- Multiple API instances (stateless)
- Multiple web instances (stateless)
- Shared PostgreSQL database
- Shared Redis instance
- Sticky sessions not required

## Authentication & Users

### Q: What are the default login credentials?

**A:** After installation:

- **Admin:** admin@node2ai.ai / admin123
- **Developer:** developer@node2ai.ai / dev123
- **Viewer:** viewer@node2ai.ai / view123
- **Auditor:** auditor@node2ai.ai / audit123

⚠️ **CHANGE THESE IMMEDIATELY** after first login!

### Q: How do I reset a forgotten password?

**A:** **Self-service password reset:**

1. Click "Forgot Password" on login page
2. Enter email address
3. Check email for reset link
4. Create new password

**Or admin can reset via dashboard:**
Settings → Users → [User] → Reset Password

### Q: Can I integrate with SSO/SAML?

**A:** Enterprise edition supports:

- **SAML 2.0** (Okta, OneLogin, Azure AD)
- **OAuth 2.0** (Google Workspace, Microsoft)
- **LDAP/Active Directory**

Contact sales@foundry360.com for enterprise features.

### Q: What MFA methods are supported?

**A:** Available MFA options:

- **TOTP** (Google Authenticator, Authy, 1Password)
- **SMS** (backup method)
- **Email** (backup method)
- **Hardware keys** (YubiKey, FIDO2) - Enterprise only

### Q: How many users can I have?

**A:** No hard limit. Recommended:

- **Small teams:** Up to 50 users
- **Medium teams:** 50-200 users
- **Enterprise:** 200+ users (consider load balancing)

### Q: What's the difference between roles?

**A:** Role permissions:

- **Admin:** Full access, user management, billing
- **Developer:** Provider keys, chat, analytics
- **Viewer:** Read-only analytics and reports
- **Auditor:** Audit logs and compliance reports

See [Security Guide](./SECURITY.md) for detailed permissions.

## AI Providers & API Keys

### Q: Which AI providers are supported?

**A:** Currently supported:

- **OpenAI** (GPT-4, GPT-3.5, etc.)
- **Anthropic** (Claude-3 family)
- **Google** (Gemini family)
- **Perplexity** (Llama 3.1 Sonar)

More providers coming soon (request via GitHub issues).

### Q: Do I need API keys from all providers?

**A:** No! Add keys only for providers you want to use. You can start with just one provider and add more later.

### Q: How much do provider API keys cost?

**A:** Pricing varies by provider (as of 2024):

- **OpenAI:** $0.03/1K tokens (GPT-4)
- **Anthropic:** $15/1M tokens (Claude-3 Opus)
- **Google:** $1.25/1M tokens (Gemini Pro)
- **Perplexity:** $0.20/1M tokens (Sonar 8B)

Check provider websites for current pricing.

### Q: Is there a free tier?

**A:** Node2AI itself is free (self-hosted). However:

- **OpenAI:** No free tier
- **Anthropic:** No free tier
- **Google:** Limited free tier available
- **Perplexity:** Limited free trial

You pay providers directly based on usage.

### Q: How secure are my provider API keys?

**A:** Very secure:

- **Encrypted** with AES-256-GCM at rest
- **Never stored** in plain text
- **Never logged** or displayed
- **Decrypted only** when needed
- **Access controlled** by roles

See [Security Guide](./SECURITY.md) for details.

### Q: Can I use the same API key across multiple organizations?

**A:** Yes, but not recommended. Better to:

- Use **separate keys per organization** (cost tracking)
- Use **separate keys per environment** (dev/staging/prod)
- Set up **spending limits** at provider level

### Q: What happens if my provider API key is invalid?

**A:** Node2AI will:

- Show error when testing connection
- Alert you via email/Slack
- Automatically try other keys (if configured)
- Log the error for troubleshooting

Add multiple keys per provider for redundancy.

### Q: How do I rotate provider API keys?

**A:** See our [Provider Keys Guide](./PROVIDER-KEYS.md#key-rotation) for detailed rotation procedures. Brief process:

1. Generate new key at provider
2. Add new key to Node2AI
3. Test new key
4. Set as primary
5. Monitor for 7 days
6. Remove old key

### Q: Can I set spending limits?

**A:** Yes, at multiple levels:

- **Provider level:** Set limits in OpenAI/Anthropic dashboard
- **Organization level:** Set budgets in Node2AI
- **User level:** Assign per-user quotas
- **API key level:** Rate limits and daily caps

## Usage & Analytics

### Q: How is usage tracked?

**A:** Node2AI tracks:

- Every API request
- Tokens used (input + output)
- Cost per request
- Provider and model used
- Response latency
- Success/error rates

All available in Analytics dashboard.

### Q: How accurate is cost tracking?

**A:** Very accurate:

- Uses **official provider pricing**
- Tracks **actual tokens used**
- Updates pricing monthly
- Rounds to 4 decimal places
- Includes all API charges

Small discrepancy possible due to provider rounding.

### Q: Can I export usage data?

**A:** Yes! Export options:

- **CSV export** (all usage data)
- **JSON export** (API accessible)
- **PDF reports** (monthly summaries)
- **API endpoint** for programmatic access

Navigate to Analytics → Export.

### Q: How long is usage data retained?

**A:** Data retention:

- **Usage events:** 2 years
- **Analytics aggregates:** Indefinitely
- **Audit logs:** 2 years
- **Detailed logs:** 90 days

Configurable in settings.

### Q: Can I see usage by user/team?

**A:** Yes! Analytics dashboard shows:

- Usage by user
- Usage by organization
- Usage by project
- Usage by provider/model
- Time-based trends

Filter by date range, user, or provider.

### Q: What's the difference between a request and a token?

**A:**

- **Request:** One API call to a provider
- **Token:** Unit of text processed (roughly 4 characters or 0.75 words)

Example: "Hello, how are you?" = 1 request, ~5 tokens

You pay per token, not per request.

## Features & Functionality

### Q: What is prompt sanitization?

**A:** Automatic removal/masking of sensitive data from prompts:

- **PII** (emails, phone numbers, SSNs)
- **Credit card numbers**
- **API keys and secrets**
- **Custom patterns** (configurable)

Protects sensitive data from being sent to AI providers.

### Q: Can I disable prompt sanitization?

**A:** Yes, but not recommended. Options:

- Disable per organization
- Disable per user
- Disable per request
- Whitelist specific patterns

Configure in Settings → Sanitization.

### Q: What is side-by-side comparison?

**A:** Send the same prompt to multiple models simultaneously and compare:

- Response quality
- Response speed
- Token usage
- Cost

Helps choose the best model for your use case.

### Q: Can I use streaming responses?

**A:** Yes! Streaming available for:

- OpenAI models
- Anthropic models
- Google models
- Perplexity models

Enable via API or chat interface for real-time responses.

### Q: Does Node2AI support function calling?

**A:** Yes, for providers that support it:

- **OpenAI:** Full function calling support
- **Anthropic:** Tool use supported
- **Google:** Function calling supported
- **Perplexity:** Not supported

Pass functions via API as per provider specs.

### Q: Can I upload files/images?

**A:** Yes! Supported file types:

- **Images:** JPG, PNG, GIF, WebP (for vision models)
- **Documents:** PDF, TXT, MD
- **Code:** Most programming languages

Max file size: 10MB (configurable).

### Q: Is there a mobile app?

**A:** Not yet. Roadmap includes:

- Progressive Web App (PWA)
- React Native mobile app
- Offline support

Current web interface is mobile-responsive.

## API & Integration

### Q: Is there an API?

**A:** Yes! Full REST API available:

- **Base URL:** https://api.yourdomain.com/api/v1
- **Authentication:** API keys or JWT tokens
- **Rate limiting:** Based on role
- **Documentation:** [API Guide](./API.md)

### Q: Are there SDKs available?

**A:** Official SDKs:

- **JavaScript/TypeScript:** `npm install @node2ai/sdk`
- **Python:** `pip install node2ai`

Community SDKs:

- Go (community-maintained)
- Ruby (community-maintained)

### Q: Can I integrate with my existing application?

**A:** Yes! Integration options:

- REST API
- Webhooks
- JavaScript SDK
- Python SDK
- Direct database access (not recommended)

See [API Guide](./API.md) for examples.

### Q: Does Node2AI support webhooks?

**A:** Yes! Webhook events:

- chat.completed
- usage.threshold
- key.test.failed
- rate.limit.exceeded

Configure in Settings → Webhooks.

### Q: What's the API rate limit?

**A:** Rate limits by role:

- **Viewer:** 60 requests/minute
- **Developer:** 100 requests/minute
- **Admin:** 300 requests/minute
- **Enterprise:** Custom

Configurable per API key.

### Q: Is GraphQL supported?

**A:** Not currently. REST API only. GraphQL is on the roadmap for v2.0.

## Troubleshooting

### Q: Why can't I connect to the database?

**A:** Common causes:

1. PostgreSQL not running: `sudo systemctl start postgresql`
2. Wrong DATABASE_URL format
3. Firewall blocking port 5432
4. Incorrect credentials
5. Database doesn't exist

Check logs: `docker-compose logs postgres`

### Q: Why do I get "Authentication failed" after login?

**A:** Possible causes:

1. JWT_SECRET not set or changed
2. Cookies blocked by browser
3. CORS misconfiguration
4. Clock skew (check system time)
5. Session expired

Try: Clear cookies, check .env, restart API.

### Q: Why are provider keys failing tests?

**A:** Common reasons:

1. Invalid or expired API key
2. Billing not set up at provider
3. Rate limit hit at provider
4. Network/firewall issues
5. Provider outage

Test manually: `curl https://api.openai.com/v1/models -H "Authorization: Bearer YOUR_KEY"`

### Q: Why is the web interface showing 502 errors?

**A:** Typical causes:

1. API service not running
2. Wrong API_URL in .env
3. Network connectivity issues
4. API overloaded
5. Database connection failed

Check: `curl http://localhost:3001/api/health`

### Q: How do I enable debug logging?

**A:** Set in .env:

```env
LOG_LEVEL=debug
ENABLE_REQUEST_LOGGING=true
```

Then restart: `docker-compose restart`

View logs: `docker-compose logs -f api`

### Q: Where are the logs stored?

**A:** Log locations:

- **Docker:** `docker-compose logs`
- **Manual install:** `/var/log/node2ai/`
- **Database:** `audit_logs` table
- **Application:** stdout/stderr

### Q: Why is Node2AI slow?

**A:** Performance checklist:

1. Check database connection pool size
2. Enable Redis caching
3. Increase server resources
4. Check for slow queries (enable query logging)
5. Review rate limiting settings
6. Check provider response times

Monitor: `docker stats`

### Q: How do I restore from backup?

**A:** Database restoration:

```bash
# Stop services
docker-compose down

# Restore database
psql node2ai < backup.sql

# Start services
docker-compose up -d
```

## Billing & Costs

### Q: How much does Node2AI cost?

**A:** Node2AI itself:

- **Self-hosted:** Free (open source)
- **Managed hosting:** Contact sales@foundry360.com
- **Enterprise support:** Contact sales@foundry360.com

AI provider costs: You pay providers directly.

### Q: Are there hidden fees?

**A:** No hidden fees! You pay:

- AI providers directly (based on usage)
- Infrastructure costs (servers, database)
- Optional: Enterprise support/managed hosting

No markup on AI costs. Transparent pricing.

### Q: How can I reduce AI costs?

**A:** Cost optimization strategies:

1. Use cheaper models when appropriate (GPT-3.5 vs GPT-4)
2. Optimize prompts (shorter = cheaper)
3. Enable caching for repeated queries
4. Set per-user spending limits
5. Use streaming to detect and stop bad responses
6. Monitor analytics to find expensive patterns

See [Provider Keys Guide](./PROVIDER-KEYS.md#cost-optimization).

### Q: Can I set up billing alerts?

**A:** Yes! Alert options:

- Daily spending threshold
- Monthly budget warning
- Provider-specific alerts
- Per-user quota alerts
- Email/Slack notifications

Configure in Settings → Alerts.

### Q: How do I track costs by department/team?

**A:** Use organizations:

1. Create separate organization per department
2. Assign users to organizations
3. View usage/costs per organization
4. Export reports by organization

Or use tags in analytics queries.

## Enterprise & Advanced

### Q: What enterprise features are available?

**A:** Enterprise edition includes:

- SSO/SAML integration
- Advanced RBAC
- SLA guarantees
- Dedicated support
- Custom integrations
- On-premise deployment
- White-labeling
- Multi-tenancy

Contact: sales@foundry360.com

### Q: Is Node2AI SOC 2 / ISO 27001 compliant?

**A:** For managed hosting:

- **SOC 2 Type II:** Yes
- **ISO 27001:** Yes
- **GDPR:** Yes
- **HIPAA:** BAA available

For self-hosted: Your responsibility.

### Q: Can I white-label Node2AI?

**A:** Yes, enterprise customers can:

- Custom branding
- Custom domain
- Remove Node2AI branding
- Custom login page

Contact sales@foundry360.com

### Q: Is there a managed/hosted version?

**A:** Yes! Managed hosting includes:

- Fully managed infrastructure
- Automatic updates
- 99.9% uptime SLA
- Daily backups
- 24/7 support
- SSL certificates
- Monitoring and alerts

Contact: sales@foundry360.com

### Q: Can Node2AI handle high traffic?

**A:** Yes! Scalability features:

- Horizontal scaling (multiple instances)
- Load balancing
- Database connection pooling
- Redis caching
- Rate limiting
- Queue management

Tested up to 10K requests/second.

### Q: Is there an SLA?

**A:** For managed hosting:

- 99.9% uptime guarantee
- 24/7 support
- 1-hour response time (P0)
- Monthly service credits

Self-hosted: No SLA.

## Data & Privacy

### Q: Where is my data stored?

**A:** **Self-hosted:** Your infrastructure
**Managed:** Choose region (US, EU, Asia)

Data includes:

- User accounts and profiles
- Usage statistics
- Audit logs
- Provider keys (encrypted)

Chat messages sent to AI providers per their policies.

### Q: Does Node2AI store my chat messages?

**A:** Configurable:

- **Default:** Metadata only (no message content)
- **Optional:** Full message logging (encrypted)
- **Analytics:** Aggregates only (anonymized)

Configure in Settings → Privacy.

### Q: Is Node2AI GDPR compliant?

**A:** Yes! Features include:

- Data export (right to access)
- Account deletion (right to erasure)
- Consent management
- Data processing agreements
- EU data residency options

See [Security Guide](./SECURITY.md#gdpr).

### Q: Can I delete all my data?

**A:** Yes! Account deletion:
Settings → Account → Delete Account

- 30-day grace period
- Permanent after 30 days
- Exports available before deletion

Or contact: privacy@foundry360.com

### Q: What data is sent to AI providers?

**A:** Sent to providers:

- Your prompts (after sanitization)
- Model settings (temperature, etc.)
- Your provider API key

NOT sent to providers:

- Your Node2AI credentials
- Other users' data
- Analytics data
- Audit logs

Each provider has own data policy.

### Q: Can I run Node2AI in an air-gapped environment?

**A:** Yes! Air-gapped deployment:

- No internet connection required
- Local model inference (if using local models)
- Offline authentication
- Local backups only

Note: Cannot use cloud AI providers without internet.

## Support & Community

### Q: How do I get help?

**A:** Support channels:

- **Documentation:** https://docs.foundry360.com/node2ai
- **Community Forum:** https://community.foundry360.com
- **GitHub Issues:** https://github.com/foundry360/node2ai/issues
- **Email:** support@foundry360.com
- **Discord:** https://discord.gg/node2ai (if available)

### Q: What's the typical response time for support?

**A:** **Community support:**

- Forum: 24-48 hours
- GitHub: 1-7 days
- Discord: Community-driven

**Paid support:**

- Email: 4 business hours
- Emergency: 1 hour
- Phone: Enterprise only

### Q: Can I request new features?

**A:** Yes! Feature requests:

- GitHub Issues (public roadmap)
- Community voting
- Enterprise customers: Direct feature requests

Submit at: https://github.com/foundry360/node2ai/issues

### Q: How can I contribute?

**A:** Contributions welcome:

- Code contributions (pull requests)
- Documentation improvements
- Bug reports
- Feature requests
- Community support

See CONTRIBUTING.md on GitHub.

### Q: Is there a roadmap?

**A:** Yes! View roadmap:

- GitHub Projects
- Community Forum
- Release notes

Major upcoming features:

- Additional AI providers
- Mobile apps
- GraphQL API
- Advanced analytics
- Fine-tuning support

## Migration & Compatibility

### Q: Can I migrate from other AI platforms?

**A:** Yes! Migration support for:

- OpenAI API (direct compatibility)
- Custom platforms (contact us)

Migration tools coming soon.

### Q: Is Node2AI backward compatible?

**A:** Version policy:

- **Major versions** (v1, v2): Breaking changes possible
- **Minor versions** (v1.1, v1.2): Backward compatible
- **Patch versions** (v1.0.1): Bug fixes only

Deprecation: 6 months notice.

### Q: Can I export my data to use elsewhere?

**A:** Yes! Export formats:

- JSON (full data export)
- CSV (analytics and usage)
- SQL (database dump)

Settings → Export Data

### Q: What happens if I stop using Node2AI?

**A:** You retain:

- Your provider API keys
- Direct provider relationships
- Exported data

You lose:

- Usage analytics (unless exported)
- Audit logs (unless exported)
- User accounts

Export everything before decommission.

## Performance & Optimization

### Q: What's the maximum number of concurrent requests?

**A:** Depends on:

- Server resources
- Database connections
- Provider rate limits

Typical: 100-500 concurrent requests
Enterprise: 1000+ with scaling

### Q: How can I improve performance?

**A:** Optimization tips:

1. Enable Redis caching
2. Increase database connection pool
3. Use CDN for static assets
4. Enable compression
5. Optimize database indexes
6. Use load balancing
7. Increase server resources

### Q: Does Node2AI cache responses?

**A:** Optional caching:

- Semantic caching (similar prompts)
- Exact match caching
- Time-based expiration
- Manual cache clearing

Configure in Settings → Caching.

## Miscellaneous

### Q: What languages are supported?

**A:** Interface languages:

- English (primary)
- Spanish (community)
- French (community)
- More coming soon

AI prompts: Any language supported by providers.

### Q: Can I use Node2AI for commercial purposes?

**A:** Yes! License allows:

- Commercial use
- Modification
- Distribution
- Private use

Check LICENSE file for details.

### Q: How often is Node2AI updated?

**A:** Release schedule:

- **Major versions:** Annually
- **Minor versions:** Quarterly
- **Patch versions:** As needed
- **Security patches:** Immediate

Enable auto-updates: Settings → Updates

### Q: Is Node2AI production-ready?

**A:** Yes! Current status:

- **Version:** 1.0+ (stable)
- **Used by:** [X] companies
- **Uptime:** 99.9%+ (managed hosting)
- **Security:** SOC 2, ISO 27001

Regular security audits and updates.

---

## Still have questions?

- 📖 Check our [Documentation](https://docs.foundry360.com/node2ai)
- 💬 Ask on [Community Forum](https://community.foundry360.com)
- 📧 Email [support@foundry360.com](mailto:support@foundry360.com)
- 🐛 Report bugs on [GitHub](https://github.com/foundry360/node2ai/issues)

---

**Last updated:** January 2024  
**Version:** 1.0.0
