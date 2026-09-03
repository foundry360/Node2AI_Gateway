# Node2AI Provider Keys Setup Guide

## Overview

Node2AI uses a **Bring Your Own Key (BYOK)** model, where you provide your own API keys from AI providers. This approach offers significant advantages in terms of security, privacy, cost transparency, and control over your AI infrastructure.

### Why BYOK?

**🔒 Security & Privacy Benefits:**

- Your API keys never leave your control
- Direct relationship with AI providers
- No third-party data sharing concerns
- Complete audit trail of usage
- Organization-scoped key isolation

**💰 Cost Transparency:**

- Pay providers directly at their rates
- No markup or hidden fees from Node2AI
- Real-time cost tracking and analytics
- Granular spending controls per key
- Detailed billing attribution

**🎯 Control & Flexibility:**

- Choose which providers to use
- Set your own spending limits
- Control model access and permissions
- Implement custom rate limiting
- Rotate keys on your schedule

### Supported AI Providers

Node2AI currently supports integration with four major AI providers:

| Provider       | Models                         | Best For                   | Context Window    | Pricing                |
| -------------- | ------------------------------ | -------------------------- | ----------------- | ---------------------- |
| **OpenAI**     | GPT-4, GPT-3.5, DALL-E         | General purpose, code      | Up to 128K tokens | $0.03/1K tokens        |
| **Anthropic**  | Claude-3 (Opus, Sonnet, Haiku) | Long documents, analysis   | Up to 200K tokens | $3-75 per 1M tokens    |
| **Google**     | Gemini Pro, Gemini Ultra       | Multimodal, cost-effective | Up to 2M tokens   | $1.25-21 per 1M tokens |
| **Perplexity** | Llama 3.1 Sonar                | Research, real-time info   | 127K tokens       | $0.20-5 per 1M tokens  |

## Supported AI Providers

### OpenAI

**Models Available:**

- GPT-4 Turbo (latest, most capable)
- GPT-4 (high reasoning, complex tasks)
- GPT-4o (optimized for speed and cost)
- GPT-3.5 Turbo (fast, cost-effective)
- DALL-E 3 (image generation)

**Capabilities:**

- Chat completions and conversations
- Code generation and debugging
- Text analysis and summarization
- Function calling and tool use
- Vision processing (GPT-4V)
- Embeddings for semantic search

**Context Windows:**

- GPT-4: 128K tokens
- GPT-3.5: 16K tokens
- DALL-E: Image generation only

**Pricing (as of 2024):**

- GPT-4 Turbo: $0.01/$0.03 per 1K tokens (input/output)
- GPT-4: $0.03/$0.06 per 1K tokens
- GPT-3.5 Turbo: $0.001/$0.002 per 1K tokens
- DALL-E 3: $0.040 per image

**Rate Limits:**

- Tier-based (5K-10K requests per minute)
- Varies by account type and usage
- Higher tiers available for enterprise

**Best For:**

- General-purpose AI tasks
- Complex reasoning and analysis
- Code generation and debugging
- Creative writing and content
- Multi-step problem solving

**Website:** https://platform.openai.com

### Anthropic (Claude)

**Models Available:**

- Claude-3.5 Sonnet (latest, balanced)
- Claude-3 Opus (most capable, expensive)
- Claude-3 Haiku (fastest, most cost-effective)
- Claude-3.5 Haiku (improved speed/quality)

**Capabilities:**

- Long document analysis (up to 200K tokens)
- Complex reasoning and analysis
- Code generation and review
- Creative writing and editing
- Safety-focused responses
- Constitutional AI principles

**Context Windows:**

- Claude-3.5 Sonnet: 200K tokens
- Claude-3 Opus: 200K tokens
- Claude-3 Haiku: 200K tokens

**Pricing (as of 2024):**

- Claude-3.5 Sonnet: $3/$15 per 1M tokens
- Claude-3 Opus: $15/$75 per 1M tokens
- Claude-3 Haiku: $0.25/$1.25 per 1M tokens

**Rate Limits:**

- 5 requests per second by default
- Higher limits available for enterprise
- Burst capacity for peak usage

**Best For:**

- Long document analysis
- Safety-critical applications
- Complex reasoning tasks
- Code review and analysis
- Research and writing

**Website:** https://console.anthropic.com

### Google (Gemini)

**Models Available:**

- Gemini 1.5 Pro (latest, most capable)
- Gemini 1.5 Flash (fast, cost-effective)
- Gemini Pro (general purpose)
- Gemini Pro Vision (multimodal)

**Capabilities:**

- Multimodal processing (text, images, video, audio)
- Very long context (up to 2M tokens)
- Code generation and analysis
- Function calling and tool use
- Real-time information access
- Free tier available

**Context Windows:**

- Gemini 1.5 Pro: 2M tokens
- Gemini 1.5 Flash: 1M tokens
- Gemini Pro: 32K tokens

**Pricing (as of 2024):**

- Gemini 1.5 Pro: $1.25/$5 per 1M tokens
- Gemini 1.5 Flash: $0.075/$0.30 per 1M tokens
- Gemini Pro: $0.50/$1.50 per 1M tokens
- Free tier: 15 requests per minute

**Rate Limits:**

- Free tier: 15 requests per minute
- Paid tier: 1,000 requests per minute
- Higher limits available

**Best For:**

- Multimodal applications
- Very long context tasks
- Cost-effective solutions
- Prototyping and experimentation
- Educational use

**Website:** https://makersuite.google.com

### Perplexity

**Models Available:**

- Llama 3.1 Sonar 8B (fast, cost-effective)
- Llama 3.1 Sonar 70B (balanced)
- Llama 3.1 Sonar 405B (most capable)
- Online variants (with web search)
- Offline variants (no web access)

**Capabilities:**

- Real-time web search integration
- Cited responses with sources
- Up-to-date information
- Research and fact-checking
- News and current events
- Academic and technical research

**Context Windows:**

- All models: 127K tokens
- Web search context included

**Pricing (as of 2024):**

- Sonar 8B: $0.20/$1.00 per 1M tokens
- Sonar 70B: $1.00/$5.00 per 1M tokens
- Sonar 405B: $5.00/$5.00 per 1M tokens

**Rate Limits:**

- Based on subscription tier
- Pro: Higher limits
- API-only plans available

**Best For:**

- Research and fact-checking
- Current events and news
- Academic research
- Technical documentation
- Real-time information needs

**Website:** https://www.perplexity.ai

## Getting API Keys - Step by Step

### OpenAI Setup (Detailed)

**Step 1: Create Account**

1. Navigate to https://platform.openai.com
2. Click "Sign up" (or "Log in" if you have an account)
3. Complete email verification
4. Verify your phone number if prompted

**Step 2: Generate API Key**

1. Navigate to API Keys: https://platform.openai.com/api-keys
2. Click "+ Create new secret key"
3. Name your key (e.g., "Node2AI Production")
4. Set permissions:
   - **Full access**: Complete API access
   - **Restricted**: Limit to specific models/features
5. Click "Create secret key"
6. **IMPORTANT**: Copy the key immediately - it won't be shown again
   - Format: `sk-proj-xxxxxxxxxxxxxxxxxxxxx`
7. Store securely (password manager recommended)

**Step 3: Set Up Billing**

1. Navigate to: https://platform.openai.com/account/billing/overview
2. Click "Add payment method"
3. Enter credit card information
4. Set up usage limits:
   - Click "Usage limits"
   - Set hard limit (e.g., $100/month)
   - Set soft limit (e.g., $50/month for alerts)
5. Enable email alerts for spending thresholds

**Step 4: Test Your Key**

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_API_KEY"
```

**Expected Response:**

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4",
      "object": "model",
      "created": 1687882411,
      "owned_by": "openai"
    }
  ]
}
```

### Anthropic Setup (Detailed)

**Step 1: Create Account**

1. Navigate to https://console.anthropic.com
2. Click "Sign Up" or "Sign In"
3. Verify email address
4. Complete account setup

**Step 2: Generate API Key**

1. Navigate to API Keys section
2. Click "Create Key"
3. Enter key name: "Node2AI Production"
4. Select permissions (if available)
5. Click "Create API Key"
6. Copy the key immediately
   - Format: `sk-ant-api03-xxxxxxxxxxxxxxxxxxxxx`
7. Store in secure location

**Step 3: Set Up Billing**

1. Navigate to Billing section
2. Add payment method
3. Review pricing tiers
4. Set up budget alerts if available

**Step 4: Test Your Key**

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-haiku-20240307",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

**Expected Response:**

```json
{
  "id": "msg_0123456789abcdef",
  "type": "message",
  "role": "assistant",
  "content": [{ "type": "text", "text": "Hello! How can I help you today?" }],
  "model": "claude-3-haiku-20240307",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": { "input_tokens": 10, "output_tokens": 10 }
}
```

### Google AI Setup (Detailed)

**Step 1: Create Account**

1. Navigate to https://makersuite.google.com/app/apikey
2. Sign in with Google account
3. Accept Terms of Service
4. Complete account verification

**Step 2: Generate API Key**

1. Click "Get API Key" or "Create API Key"
2. Select or create a Google Cloud project:
   - Click "Create API key in new project" OR
   - Select existing project from dropdown
3. API key is generated automatically
   - Format: `AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
4. Copy and store securely

**Step 3: Restrict API Key (Recommended)**

1. Click "Edit" on your API key
2. Set application restrictions:
   - **IP addresses**: Add your server IPs
   - **HTTP referrers**: Add your domains
3. Set API restrictions:
   - Select "Restrict key"
   - Choose "Generative Language API"
4. Click "Save"

**Step 4: Enable Billing (for beyond free tier)**

1. Navigate to Google Cloud Console
2. Select your project
3. Go to Billing
4. Link billing account
5. Set budget alerts

**Step 5: Test Your Key**

```bash
curl "https://generativelanguage.googleapis.com/v1/models?key=YOUR_API_KEY"
```

**Expected Response:**

```json
{
  "models": [
    {
      "name": "models/gemini-pro",
      "version": "001",
      "displayName": "Gemini Pro",
      "description": "The best model for scaling across a wide range of tasks",
      "inputTokenLimit": 30720,
      "outputTokenLimit": 8192,
      "supportedGenerationMethods": ["generateContent"]
    }
  ]
}
```

### Perplexity Setup (Detailed)

**Step 1: Create Account**

1. Navigate to https://www.perplexity.ai
2. Click "Sign Up" or "Sign In"
3. Choose subscription plan:
   - **Free tier**: Limited requests
   - **Pro ($20/month)**: UI + API credits
   - **API-only plan**: Pay-as-you-go

**Step 2: Generate API Key**

1. Navigate to Settings → API
2. Click "Generate API Key"
3. Name your key: "Node2AI Production"
4. Copy the key immediately
   - Format: `pplx-xxxxxxxxxxxxxxxxxxxxx`
5. Store securely

**Step 3: Purchase API Credits (if needed)**

1. Navigate to API Credits section
2. Select credit package
3. Complete purchase
4. Credits are added to account

**Step 4: Test Your Key**

```bash
curl https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "llama-3.1-sonar-small-128k-online",
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

**Expected Response:**

```json
{
  "id": "pplx-0123456789abcdef",
  "object": "chat.completion",
  "created": 1704067200,
  "model": "llama-3.1-sonar-small-128k-online",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 10,
    "total_tokens": 20
  }
}
```

## Adding Keys to Node2AI

### Method 1: Web Dashboard (Recommended)

**Step 1: Login**

- Navigate to `http://your-node2ai-url.com`
- Login with your credentials
- Ensure you have admin or developer permissions

**Step 2: Access Provider Keys**

- Click Settings (gear icon) in sidebar
- Click "Provider Keys" in submenu
- Or navigate directly to `/dashboard/provider-keys`

**Step 3: Add New Key**

- Click "Add Provider Key" button (top right)
- Form appears with the following fields:

**Provider Selection:**

- Select from dropdown: OpenAI, Anthropic, Google, or Perplexity

**API Key:**

- Paste your API key
- Field is password-masked for security
- No spaces or extra characters

**Optional Metadata:**

- **Key Name**: Descriptive name (e.g., "Production OpenAI GPT-4")
- **Default Model**: Model to use by default (e.g., "gpt-4")
- **Environment**: production, staging, or development
- **Region**: us-east-1, eu-west-1, etc.
- **Description**: Notes about this key's purpose

**Step 4: Save and Test**

- Click "Add Provider Key"
- Key is encrypted and saved
- Green success message appears
- Key appears in list with masked value (sk-p...key)

**Step 5: Test Connection**

- Click "Test" button next to your new key
- Wait 5-10 seconds for validation
- Results shown:
  - ✅ **Success**: "Connection successful - 245ms"
  - ❌ **Failed**: "Authentication error: invalid API key"
- If successful, status indicator turns green
- Available models listed

**Step 6: Set as Default (Optional)**

- Click three-dot menu on key row
- Select "Set as Default"
- This key will be used for this provider by default

### Method 2: API (Programmatic)

**Step 1: Get Authentication Token**

```bash
# Get JWT token first
TOKEN=$(curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@node2ai.ai","password":"admin123"}' \
  | jq -r '.data.token')

echo "Token: $TOKEN"
```

**Step 2: Add Provider Key**

```bash
# Add OpenAI key
curl -X POST http://localhost:3001/api/v1/provider-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "openai",
    "apiKey": "sk-proj-your-actual-openai-key-here",
    "keyMetadata": {
      "keyName": "Production OpenAI Key",
      "model": "gpt-4",
      "environment": "production",
      "region": "us-east-1",
      "description": "Primary production key for GPT-4 requests"
    }
  }'
```

**Expected Response:**

```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "provider": "openai",
    "keyName": "Production OpenAI Key",
    "isActive": true,
    "createdAt": "2024-01-15T10:30:00.000Z"
  }
}
```

**Step 3: Test the Key**

```bash
KEY_ID="550e8400-e29b-41d4-a716-446655440000"
curl -X POST http://localhost:3001/api/v1/provider-keys/$KEY_ID/test \
  -H "Authorization: Bearer $TOKEN"
```

**Step 4: List All Keys**

```bash
curl http://localhost:3001/api/v1/provider-keys \
  -H "Authorization: Bearer $TOKEN"
```

### Method 3: CLI Tool (Future)

```bash
# Login
node2ai auth login

# Add provider key
node2ai providers add openai \
  --key "sk-proj-..." \
  --name "Production Key" \
  --environment production

# Test key
node2ai providers test openai

# List keys
node2ai providers list
```

## Key Management Best Practices

### Security Best Practices

**✅ Do:**

- **Never commit keys to git**: Add to .gitignore, use environment variables
- **Use separate keys per environment**: dev, staging, prod
- **Rotate keys regularly**: Every 90 days for production
- **Set spending limits**: At provider level to prevent unexpected charges
- **Monitor usage**: Check dashboards daily for anomalies
- **Revoke compromised keys immediately**: Don't wait
- **Use descriptive names**: Know what each key is for
- **Document key owners**: Who manages which keys
- **Enable MFA on provider accounts**: Extra security layer
- **Store keys in password manager**: 1Password, LastPass, Bitwarden

**❌ Don't:**

- **Never share keys**: Create separate keys for each user/app
- **Don't screenshot keys**: Could be exposed
- **Don't email keys**: Unencrypted and permanent
- **Don't log keys**: Keep out of application logs
- **Don't use production keys in development**: Separate environments
- **Don't ignore security alerts**: Act on them immediately

### Organization Strategies

**Naming Convention:**

```
Format: [Environment]-[Provider]-[Purpose]-[Version]
Examples:
- prod-openai-gpt4-primary-v1
- staging-anthropic-claude-testing-v1
- dev-google-gemini-experiments-v1
- prod-perplexity-research-backup-v2
```

**Key Inventory Spreadsheet:**

| Key Name             | Provider   | Created    | Owner   | Environment | Monthly Budget | Last Rotated | Next Rotation |
| -------------------- | ---------- | ---------- | ------- | ----------- | -------------- | ------------ | ------------- |
| prod-openai-gpt4-v1  | OpenAI     | 2024-01-15 | Jason   | Production  | $500           | 2024-01-15   | 2024-04-15    |
| staging-claude-v1    | Anthropic  | 2024-01-20 | DevTeam | Staging     | $50            | 2024-01-20   | 2024-07-20    |
| dev-google-gemini-v1 | Google     | 2024-01-25 | Sarah   | Development | $25            | 2024-01-25   | 2024-07-25    |
| prod-perplexity-v1   | Perplexity | 2024-02-01 | Mike    | Production  | $100           | 2024-02-01   | 2024-05-01    |

### Cost Management

**Set Monthly Budgets:**

- OpenAI: Set hard limits in platform
- Anthropic: Monitor usage dashboard
- Google: Set budget alerts in Cloud Console
- Perplexity: Purchase credit packages

**Monitor Node2AI Analytics:**

- Daily cost tracking
- Per-user spending attribution
- Model usage patterns
- Peak usage times

**Optimize Model Selection:**

- Use cheaper models for simple tasks:
  - GPT-3.5 instead of GPT-4 for basic queries
  - Claude Haiku instead of Opus for quick responses
  - Gemini Flash instead of Pro for fast processing
- Implement prompt caching where available
- Set per-user usage quotas in Node2AI
- Review monthly spend and optimize

## Testing Provider Connections

### What Gets Tested

**✅ Authentication:**

- API key validity
- Correct format and length
- Provider account status

**✅ Network Connectivity:**

- Reachability to provider APIs
- DNS resolution
- Firewall and proxy issues

**✅ Service Availability:**

- Provider service status
- Rate limit status
- Quota availability

**✅ Model Access:**

- Available models for your account
- Model permissions
- Regional restrictions

**✅ Performance:**

- Response latency
- Timeout handling
- Error rate monitoring

### Test Process

```
1. Node2AI retrieves encrypted key from database
2. Decrypts key in memory (never logged)
3. Makes minimal API call to provider
4. Validates response format and content
5. Records results in database
6. Updates key status and metrics
7. Triggers alerts if test fails
```

### Test Results Interpretation

**✅ Success**

- **Status**: Connection successful
- **Latency**: 245ms (varies by provider and region)
- **Available Models**: [list of models]
- **What this means**: Key is valid and working properly
- **Next steps**: Ready to use in production

**❌ Authentication Failed**

- **Status**: Authentication error
- **Error**: "Invalid API key" or "Unauthorized"
- **What this means**: Key is invalid, expired, or revoked
- **Next steps**:
  1. Verify key was copied correctly (no spaces)
  2. Check provider dashboard for key status
  3. Generate new key if needed
  4. Update in Node2AI

**⚠️ Rate Limited**

- **Status**: Rate limit exceeded
- **Error**: "Too many requests"
- **What this means**: Hitting provider rate limits
- **Next steps**:
  1. Wait and retry (automatic in Node2AI)
  2. Add additional keys for load balancing
  3. Upgrade provider tier
  4. Reduce request frequency

**❌ Network Error**

- **Status**: Connection failed
- **Error**: "Network timeout" or "Connection refused"
- **What this means**: Network connectivity issues
- **Next steps**:
  1. Check internet connection
  2. Verify firewall allows outbound HTTPS
  3. Check provider status page
  4. Try again in a few minutes

**❌ Quota Exceeded**

- **Status**: Quota exceeded
- **Error**: "Insufficient credits" or "Billing required"
- **What this means**: Hit spending limit or credits exhausted
- **Next steps**:
  1. Check provider billing dashboard
  2. Add payment method if not set up
  3. Increase spending limits
  4. Purchase more credits (Perplexity)

### Troubleshooting Failed Tests

**Manual Testing with cURL:**

**OpenAI:**

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY" \
  -v  # verbose output shows HTTP details
```

**Anthropic:**

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: YOUR_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"test"}]}' \
  -v
```

**Google:**

```bash
curl "https://generativelanguage.googleapis.com/v1/models?key=YOUR_KEY" \
  -v
```

**Perplexity:**

```bash
curl https://api.perplexity.ai/chat/completions \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.1-sonar-small-128k-online","messages":[{"role":"user","content":"test"}]}' \
  -v
```

## Multi-Key Configuration

### Use Cases for Multiple Keys

**Load Balancing**

```
Setup:
- Key 1: OpenAI GPT-4 (1000 RPM limit)
- Key 2: OpenAI GPT-4 (1000 RPM limit)
- Key 3: OpenAI GPT-4 (1000 RPM limit)

Result: 3000 RPM total capacity

Node2AI automatically:
- Distributes requests across keys
- Monitors rate limits per key
- Routes around exhausted keys
- Provides high availability
```

**Fallback/Redundancy**

```
Setup:
- Primary: OpenAI GPT-4 (main production key)
- Backup: OpenAI GPT-4 (emergency key)

Behavior:
- All traffic uses primary key
- If primary fails → automatic switch to backup
- Alert sent to admin
- Zero downtime for users
```

**Environment Separation**

```
Setup:
- Development: Lower spending limits, cheaper models
- Staging: Production-like testing
- Production: High limits, all models

Benefits:
- Cost control (dev doesn't impact prod budget)
- Testing safety (experiments don't affect users)
- Clear cost attribution
```

**Model-Specific Keys**

```
Setup:
- Key A: Limited to GPT-3.5 only (cost control)
- Key B: Full access including GPT-4 (premium features)

Use when:
- Different user tiers
- Cost-sensitive applications
- Testing before production
```

## Key Rotation Procedures

### Why Rotate Keys

**Security Benefits:**

- Limit exposure window if compromised
- Comply with security frameworks (SOC 2, ISO 27001)
- Follow industry best practices
- Reduce risk of unauthorized access

**Compliance Requirements:**

- SOC 2 Type II controls
- ISO 27001 standards
- PCI DSS requirements
- Internal security policies

**Operational Benefits:**

- Regular security hygiene
- Team member access changes
- Provider account updates
- Performance optimization

### Rotation Schedule

| Key Type                 | Rotation Frequency | Reason                   |
| ------------------------ | ------------------ | ------------------------ |
| **Critical Production**  | Every 30 days      | Maximum security         |
| **Standard Production**  | Every 90 days      | Balanced security/effort |
| **Development**          | Every 180 days     | Lower risk environment   |
| **Suspected Compromise** | Immediately        | Security incident        |

### Zero-Downtime Rotation Process

**Day 0: Planning**

- [ ] Schedule rotation during low-traffic period
- [ ] Notify team of upcoming rotation
- [ ] Document current key details
- [ ] Verify backup key is available
- [ ] Prepare rollback plan

**Day 1: Generate New Key**

- [ ] Login to provider dashboard
- [ ] Generate new API key
- [ ] Copy key to secure location
- [ ] **DO NOT delete old key yet**
- [ ] Test new key manually

**Day 2: Add to Node2AI**

- [ ] Add new key to Node2AI
- [ ] Mark as "staging" or "inactive"
- [ ] Test new key thoroughly
- [ ] Verify all models accessible
- [ ] Check rate limits and quotas

**Days 3-4: Parallel Running**

- [ ] Set new key to 10% traffic
- [ ] Monitor for errors and performance
- [ ] Compare metrics between keys
- [ ] Verify billing attribution
- [ ] Check cost differences

**Day 5: Full Cutover**

- [ ] Set new key as primary
- [ ] Old key becomes backup
- [ ] Monitor closely for 24 hours
- [ ] Check error rates and latency
- [ ] Verify all features work correctly

**Day 12: Cleanup (7 days after cutover)**

- [ ] Confirm no issues with new key
- [ ] Disable old key in Node2AI
- [ ] Revoke old key at provider
- [ ] Delete old key from Node2AI
- [ ] Update documentation
- [ ] Update key inventory

**Post-Rotation:**

- [ ] Document lessons learned
- [ ] Update rotation playbook
- [ ] Schedule next rotation
- [ ] Update team on process improvements

### Emergency Rotation (Compromised Key)

**Immediate (0-15 minutes):**

1. Revoke key at provider dashboard immediately
2. Disable key in Node2AI
3. Switch to backup key
4. Alert security team
5. Document incident timeline

**Within 1 hour:** 6. Generate new replacement key 7. Add to Node2AI 8. Test thoroughly 9. Set as primary 10. Monitor for abuse of old key

**Within 24 hours:** 11. Review logs for unauthorized usage 12. Assess impact and costs 13. Update security procedures 14. Complete incident report 15. Notify affected parties if required

## Monitoring & Alerts

### Usage Monitoring in Node2AI

**Dashboard Location:** `/dashboard/analytics`

**Metrics Available:**

- Requests per provider/model
- Token consumption and costs
- Latency trends and performance
- Error rates and failures
- Rate limit hits and retries
- User attribution and quotas

**Real-time Monitoring:**

- Live request tracking
- Current rate limit status
- Active key health
- Cost accumulation
- Error rate alerts

### Set Up Alerts

**Recommended Alerts:**

- **Daily spending exceeds $X**: Cost control
- **Provider key test fails**: Key health monitoring
- **Rate limit exceeded 3+ times**: Performance issues
- **Error rate above 5%**: Service quality
- **Unusual request patterns**: Security monitoring
- **New IP address for API access**: Security alert

**Alert Configuration:**

```bash
# Example alert thresholds
DAILY_SPENDING_ALERT=100  # USD
ERROR_RATE_THRESHOLD=5    # Percentage
RATE_LIMIT_THRESHOLD=3    # Consecutive failures
LATENCY_THRESHOLD=5000    # Milliseconds
```

### Provider Dashboard Monitoring

**OpenAI Monitoring:**

- **Usage Dashboard**: https://platform.openai.com/usage
- **Billing**: https://platform.openai.com/account/billing
- **Rate Limits**: https://platform.openai.com/account/rate-limits

**Anthropic Monitoring:**

- **Console**: https://console.anthropic.com
- **Usage**: Check usage section
- **Billing**: Review spending and limits

**Google Monitoring:**

- **Cloud Console**: https://console.cloud.google.com
- **APIs & Services**: Monitor API usage
- **Billing**: Set up budget alerts

**Perplexity Monitoring:**

- **Dashboard**: https://www.perplexity.ai/settings
- **API Usage**: Check credit consumption
- **Billing**: Monitor credit balance

## Troubleshooting Guide

### Issue: "Invalid API Key" Error

**Symptoms:**

- Test connection fails
- "401 Unauthorized" errors
- "Invalid API key" message

**Diagnosis:**

1. **Check key format matches provider:**
   - OpenAI: starts with `sk-proj-` or `sk-`
   - Anthropic: starts with `sk-ant-api`
   - Google: starts with `AIza`
   - Perplexity: starts with `pplx-`

2. **Verify no extra whitespace:**

   ```bash
   echo "YOUR_KEY" | wc -c
   # Should match expected length
   ```

3. **Check provider dashboard:**
   - Is key still active?
   - Was it revoked?
   - Check expiration date

**Solutions:**

- Re-copy key carefully
- Regenerate key if needed
- Check copy/paste didn't truncate
- Try in curl command directly

### Issue: "Quota Exceeded" or "Insufficient Credits"

**Symptoms:**

- Requests failing after working
- "429 Quota Exceeded" errors
- "Payment required" messages

**Diagnosis:**

1. **Check provider billing:**
   - OpenAI: Check usage page
   - Perplexity: Check credits balance
   - Google: Check quota limits

2. **Review spending limits:**
   - Hit hard cap?
   - Need to increase limit?

**Solutions:**

- Add payment method
- Increase spending limits
- Purchase more credits
- Enable billing if on free tier
- Wait for quota to reset (if daily limit)

### Issue: "Rate Limit Exceeded"

**Symptoms:**

- "429 Too Many Requests" errors
- Intermittent failures during high traffic
- Requests queuing in Node2AI

**Diagnosis:**

1. **Check current rate limits:**
   - OpenAI: Tier-based (check platform)
   - Anthropic: 5 req/sec default
   - Google: 60 RPM (free), 1000 RPM (paid)

2. **Review request patterns:**
   - Bursts of traffic?
   - Concurrent requests?
   - Loop creating too many calls?

**Solutions:**

- Add more API keys for load balancing
- Implement request queuing
- Reduce request frequency
- Upgrade provider tier
- Enable caching in application
- Use batch requests where possible

### Issue: "Model Not Available"

**Symptoms:**

- "Model not found" errors
- "Access denied to model" messages
- Specific model requests failing

**Diagnosis:**

1. **Verify model name spelling:**
   - Check provider documentation
   - Model names are case-sensitive

2. **Check account access:**
   - Some models require special access
   - GPT-4: Requires separate approval
   - Claude Opus: Check tier access

3. **Check model availability:**
   - Model might be deprecated
   - Region restrictions

**Solutions:**

- Correct model name spelling
- Request access from provider
- Upgrade account tier
- Use alternative model
- Check provider status page

## Provider Comparison Table

| Feature              | OpenAI              | Anthropic         | Google                  | Perplexity     |
| -------------------- | ------------------- | ----------------- | ----------------------- | -------------- |
| **Best For**         | General purpose     | Long documents    | Multimodal              | Research       |
| **Max Context**      | 128K tokens         | 200K tokens       | 2M tokens               | 127K tokens    |
| **Pricing (Input)**  | $0.03/1K (GPT-4)    | $3/$15 per 1M     | $1.25 per 1M            | $0.20 per 1M   |
| **Pricing (Output)** | $0.06/1K            | $15/$75 per 1M    | $5 per 1M               | $1.00 per 1M   |
| **Rate Limits**      | Tiered (5K-10K RPM) | 5 req/sec         | 60-1000 RPM             | Tier-based     |
| **Free Tier**        | No                  | No                | Yes (limited)           | Limited        |
| **Vision**           | Yes (GPT-4V)        | Yes (Claude 3)    | Yes (Gemini Pro Vision) | No             |
| **Web Search**       | No (use plugins)    | No                | No                      | Yes (built-in) |
| **Citations**        | No                  | No                | No                      | Yes            |
| **Function Calling** | Yes                 | Yes               | Yes                     | No             |
| **JSON Mode**        | Yes                 | No                | Yes                     | No             |
| **Streaming**        | Yes                 | Yes               | Yes                     | Yes            |
| **Best Model**       | GPT-4 Turbo         | Claude-3.5 Sonnet | Gemini 1.5 Pro          | Sonar 70B      |

## Cost Optimization Strategies

### Model Selection

**Use Case → Recommended Model:**

| Task Type         | Recommended Model               | Cost Savings |
| ----------------- | ------------------------------- | ------------ |
| Simple chat       | GPT-3.5 Turbo or Claude Haiku   | 90%+         |
| Complex reasoning | GPT-4 or Claude Sonnet          | Standard     |
| Long documents    | Claude Opus or Gemini Pro       | 50%+         |
| Vision tasks      | GPT-4V or Gemini Pro Vision     | Standard     |
| Research          | Perplexity Sonar with citations | 80%+         |
| Code generation   | GPT-4 or Claude Sonnet          | Standard     |

### Prompt Optimization

**❌ Inefficient:**

```
"Please analyze this document and tell me everything about it,
including all the details, main points, themes, conclusions,
and any other relevant information..."
```

**✅ Efficient:**

```
"Summarize key points from this document in 3 bullet points."
```

**Savings:** 70% fewer tokens

### Caching Strategies

**Implement Caching:**

- Cache common queries (FAQ responses)
- Cache embeddings for documents
- Reuse system prompts across requests
- Store and reuse generated content

**Savings:** 50-90% on repeated queries

### Smart Routing

**Cost-Based Routing:**

- Route simple queries to cheaper models
- Use expensive models only when needed
- Implement fallback chains
- Monitor and adjust routing rules

## Security Considerations

### How Node2AI Protects Your Keys

**✅ Encryption at Rest:**

- AES-256-GCM encryption
- Keys never stored in plain text
- Encryption keys stored separately (KMS)
- Database-level encryption

**✅ Access Control:**

- Keys masked in UI (show only first/last 4 chars)
- Keys never sent to browser/client
- Keys never logged (even in errors)
- Keys only decrypted at request time

**✅ Audit Trail:**

- Complete audit trail for all key operations
- Role-based access control
- Organization-scoped isolation
- Security event logging

**✅ Operational Security:**

- Keys rotated in memory after use
- Secure key transmission
- Regular security scans
- Compliance monitoring

### What You Should Do

**✅ Security Best Practices:**

- Use strong passwords for Node2AI account
- Enable MFA on provider accounts
- Rotate keys every 90 days
- Monitor usage for anomalies
- Set spending limits at providers
- Use separate keys per environment
- Revoke keys when team members leave
- Store backup keys securely
- Review audit logs regularly

**✅ Monitoring:**

- Set up cost alerts
- Monitor for unusual patterns
- Track key usage by user
- Review failed authentication attempts
- Check for unauthorized access

## FAQ

### General Questions

**Q: Can I use the same provider key across multiple organizations in Node2AI?**
A: Keys are organization-scoped in Node2AI, but you can add the same provider key to multiple organizations if needed. However, for cost tracking and security, we recommend separate keys per organization.

**Q: How many provider keys can I add?**
A: No hard limit. Recommended: 2-3 keys per provider (primary, backup, development).

**Q: What happens if my key expires or is revoked?**
A: Requests will fail with authentication errors. Node2AI will alert you. Add a new key before expiring the old one to avoid downtime.

**Q: Can I export or view my provider API keys after adding them?**
A: For security, keys cannot be exported or viewed after encryption. You must retrieve them from the provider if needed.

**Q: How do I know which key was used for a specific request?**
A: Check Analytics dashboard → Usage tab. Each request shows the provider key ID used.

### Key Management

**Q: Can I temporarily disable a key without deleting it?**
A: Yes, click the three-dot menu on any key and select "Disable". Traffic will route to other active keys.

**Q: What happens if all my keys for a provider are rate-limited?**
A: Requests will queue and retry with exponential backoff. Users see "Provider temporarily unavailable" message.

**Q: Do you support provider key rotation automation?**
A: Not yet, but it's on the roadmap. Currently requires manual rotation following our documented process.

**Q: Can I set different keys for different models?**
A: Yes, specify the model in the key metadata and Node2AI will route appropriately.

**Q: What if a provider changes their API key format?**
A: Node2AI is provider-agnostic. New format keys will work immediately. We'll update documentation if validation changes.

### Troubleshooting

**Q: My key test fails but works in curl. What's wrong?**
A: Check for extra whitespace, verify the key format, and ensure Node2AI has internet access to the provider.

**Q: I'm getting rate limited but my provider says I'm not. Why?**
A: Check if you have multiple keys configured. Node2AI might be hitting limits on one key while others are available.

**Q: Can I test a key before adding it to production?**
A: Yes, add it as "staging" or "inactive" first, test thoroughly, then promote to production.

**Q: How do I know if my key is being used efficiently?**
A: Check the Analytics dashboard for usage patterns, costs per request, and model performance metrics.

## Additional Resources

### Provider Documentation

- **OpenAI API Docs**: https://platform.openai.com/docs
- **Anthropic API Docs**: https://docs.anthropic.com
- **Google AI Docs**: https://ai.google.dev/docs
- **Perplexity API Docs**: https://docs.perplexity.ai

### Pricing Calculators

- **OpenAI**: https://openai.com/pricing
- **Anthropic**: https://www.anthropic.com/pricing
- **Google**: https://ai.google.dev/pricing
- **Perplexity**: https://www.perplexity.ai/pricing

### Status Pages

- **OpenAI Status**: https://status.openai.com
- **Anthropic Status**: https://status.anthropic.com
- **Google Cloud Status**: https://status.cloud.google.com

### Community

- **Node2AI Forum**: https://community.foundry360.com
- **GitHub Issues**: https://github.com/foundry360/node2ai/issues
- **Discord**: https://discord.gg/node2ai (if available)

---

**Need Help?** Contact our support team at support@foundry360.com or check our comprehensive documentation at https://docs.foundry360.com/node2ai.
