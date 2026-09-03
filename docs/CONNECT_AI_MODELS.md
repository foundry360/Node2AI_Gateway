# Connect AI Models - Quick Start

## Overview

Node2AI supports multiple AI providers. This guide shows you how to connect your API keys and start testing.

## Supported Providers

- **OpenAI** - GPT-4, GPT-3.5, DALL-E
- **Anthropic** - Claude-3, Claude-2
- **Google** - Gemini Pro, PaLM
- **Perplexity** - Perplexity AI

## Step 1: Get API Keys

Get API keys from your providers:

1. **OpenAI**: https://platform.openai.com/api-keys
2. **Anthropic**: https://console.anthropic.com/account/keys
3. **Google**: https://aistudio.google.com/app/apikey
4. **Perplexity**: https://www.perplexity.ai/settings/api

## Step 2: Add Keys via UI (Recommended)

### Through Account Settings

1. Navigate to **Settings** → **API Keys** tab
2. Click **+ Add Provider Key**
3. Fill in the form:
   - **Provider**: Select your provider
   - **API Key**: Paste your API key
   - **Environment**: Choose production/staging/development
   - **Description**: Optional notes
4. Click **Verify Key** to test the connection
5. Click **Save Key** when verified

Your key will be encrypted and stored securely in the database.

## Step 3: Add Keys via Environment (Alternative)

For quick testing, add keys to your `.env` file:

```bash
# OpenAI
OPENAI_API_KEY=sk-your-key-here

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Google
GOOGLE_API_KEY=your-key-here

# Perplexity
PERPLEXITY_API_KEY=your-key-here
```

**⚠️ Note**: This method is less secure than using the encrypted database storage.

## Step 4: Test the Connection

### Using the UI

1. Go to **Settings** → **API Keys**
2. Find your key in the list
3. Click **Test** button
4. Wait for verification results

### Using cURL

```bash
# Test OpenAI
curl -X POST http://localhost:3001/api/v1/chat/simple \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "provider": "openai",
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'

# Test Anthropic
curl -X POST http://localhost:3001/api/v1/chat/simple \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "provider": "anthropic",
    "model": "claude-3-haiku-20240307",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

## Step 5: Make Your First Chat Request

### Using the API

```bash
curl -X POST http://localhost:3001/api/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [
      {"role": "user", "content": "What is Node2AI?"}
    ]
  }'
```

### Using the SDK

```typescript
import { Node2AIClient } from '@node2/sdk';

const client = new Node2AIClient({
  apiKey: 'your-api-key',
  baseURL: 'http://localhost:3001',
});

const response = await client.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: [{ role: 'user', content: 'Hello!' }],
});

console.log(response);
```

## Troubleshooting

### Key Not Found

**Problem**: "API key not found"
**Solution**:

- Check the key is saved in the database
- Verify encryption key is set (`PROVIDER_KEY_ENCRYPTION_KEY`)
- Check organization ID is correct

### Authentication Failed

**Problem**: "Authentication failed"
**Solution**:

- Verify the API key is valid
- Check for typos in the key
- Ensure the key has the correct permissions

### Rate Limits

**Problem**: "Rate limit exceeded"
**Solution**:

- Check your provider's rate limits
- Implement exponential backoff
- Use multiple API keys for load balancing

### Test Fails

**Problem**: Key test returns failure
**Solution**:

- Verify the key is valid with the provider
- Check network connectivity
- Review provider status page

## Security Best Practices

1. **Use UI Storage**: Store keys through the UI for encryption
2. **Environment Variables**: For development only
3. **Rotate Keys**: Update keys regularly
4. **Limit Access**: Use environment restrictions
5. **Monitor Usage**: Check API usage regularly

## Next Steps

Once your models are connected:

1. ✅ Test each provider individually
2. ✅ Try multi-provider chat completions
3. ✅ Enable smart routing for cost optimization
4. ✅ Set up usage monitoring
5. ✅ Configure rate limits

## API Endpoints

- `GET /api/v1/provider-keys` - List keys
- `POST /api/v1/provider-keys` - Add key
- `GET /api/v1/provider-keys/:id` - Get key details
- `PUT /api/v1/provider-keys/:id` - Update key
- `DELETE /api/v1/provider-keys/:id` - Delete key
- `POST /api/v1/provider-keys/:id/test` - Test key

## Provider-Specific Information

### OpenAI

- **Models**: `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo`
- **Base URL**: `https://api.openai.com/v1`
- **Rate Limits**: Varies by plan
- **Documentation**: https://platform.openai.com/docs

### Anthropic

- **Models**: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`
- **Base URL**: `https://api.anthropic.com/v1`
- **Rate Limits**: Varies by plan
- **Documentation**: https://docs.anthropic.com

### Google

- **Models**: `gemini-pro`, `gemini-pro-vision`, `gemini-ultra`
- **Base URL**: `https://generativelanguage.googleapis.com/v1`
- **Rate Limits**: 60 requests/minute
- **Documentation**: https://ai.google.dev/docs

### Perplexity

- **Models**: `llama-3.1-sonar-*`
- **Base URL**: `https://api.perplexity.ai/chat/completions`
- **Rate Limits**: Varies by plan
- **Documentation**: https://docs.perplexity.ai

## Support

For issues connecting models:

1. Check provider status pages
2. Verify API keys are valid
3. Review error logs
4. Contact support with details

Happy testing! 🚀
