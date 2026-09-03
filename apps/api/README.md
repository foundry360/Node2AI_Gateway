# Node2AI API Gateway

The Node2AI API Gateway is a comprehensive Next.js 14 application that provides a unified interface for AI model interactions, data sanitization, and enterprise features. Built for regulated industries with strict compliance requirements.

## 🏗️ Architecture

### Core Components

- **API Routes**: RESTful endpoints following OpenAI-compatible patterns
- **Provider System**: Pluggable architecture supporting multiple AI providers
- **Security Engine**: Advanced data sanitization and classification
- **Smart Routing**: Intelligent provider selection based on cost, quality, and latency
- **Knowledge Base**: RAG (Retrieval Augmented Generation) capabilities
- **Audit System**: Comprehensive logging for compliance
- **License Management**: Feature gating and usage tracking

### Technology Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript 5+ with strict mode
- **Database**: PostgreSQL with pgvector extension
- **Cache**: Redis for session management and rate limiting
- **Authentication**: JWT with optional SSO integration
- **Security**: End-to-end encryption and data sanitization
- **Monitoring**: Prometheus metrics and health checks

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- PostgreSQL 15+ with pgvector
- Redis 7+

### Installation

```bash
# Install dependencies
pnpm install

# Set up environment variables
cp env.example .env.local
# Edit .env.local with your configuration

# Run database migrations
pnpm db:migrate

# Start development server
pnpm dev
```

### Environment Configuration

Key environment variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/node2

# Redis
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-jwt-secret
ENCRYPTION_KEY=your-encryption-key

# AI Providers
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Deployment
DEPLOYMENT_MODE=self-hosted
NODE_ENV=development
```

## 📚 API Endpoints

### Chat Completions

**POST** `/api/v1/chat/completions`

OpenAI-compatible chat completions with smart routing and sanitization.

```json
{
  "model": "gpt-4",
  "messages": [{ "role": "user", "content": "Hello, world!" }],
  "temperature": 0.7,
  "max_tokens": 1000,
  "stream": false,
  "sanitize_input": true,
  "sanitize_output": true
}
```

### Model Comparison

**POST** `/api/v1/chat/compare`

Compare responses from multiple models side-by-side.

```json
{
  "prompt": "Explain quantum computing",
  "models": ["gpt-4", "claude-3", "llama2:7b"],
  "include_metrics": true,
  "include_costs": true
}
```

### Smart Routing

**POST** `/api/v1/chat/smart`

Intelligent provider selection with cost and quality optimization.

```json
{
  "messages": [{ "role": "user", "content": "Help me write code" }],
  "cost_constraint": { "max_cost": 0.1 },
  "quality_requirements": { "min_quality_score": 0.8 },
  "latency_requirements": { "max_latency_ms": 5000 }
}
```

### Knowledge Base

**POST** `/api/v1/knowledge/ingest`

Upload and process documents for RAG.

```json
{
  "files": [
    {
      "name": "document.pdf",
      "content": "base64-encoded-content",
      "type": "pdf"
    }
  ],
  "collection": "company-docs",
  "chunk_size": 1000,
  "extract_entities": true
}
```

**POST** `/api/v1/knowledge/search`

Semantic search in knowledge base.

```json
{
  "query": "What is our refund policy?",
  "collection": "company-docs",
  "limit": 10,
  "include_context": true
}
```

### Usage Analytics

**GET** `/api/v1/usage/summary`

Get usage statistics and analytics.

**GET** `/api/v1/usage/costs`

Get cost breakdown by provider, model, and user.

### Authentication

**POST** `/api/v1/auth/login`

Authenticate users with local credentials or SSO.

```json
{
  "email": "user@company.com",
  "password": "password123",
  "remember_me": true
}
```

## 🔧 Adding a New Provider

### 1. Create Provider Class

```typescript
// src/lib/providers/custom.ts
import { Provider } from './base';
import { Message, ChatOptions, ChatResponse } from '@/lib/types/providers';

export class CustomProvider extends Provider {
  readonly name = 'custom';
  readonly models = ['custom-model-1', 'custom-model-2'];

  constructor(config: any) {
    super(config);
  }

  async chat(messages: Message[], options: ChatOptions): Promise<ChatResponse> {
    // Implement chat completion logic
    const response = await this.callCustomAPI(messages, options);
    return this.normalizeResponse(response);
  }

  async *stream(
    messages: Message[],
    options: ChatOptions
  ): AsyncIterableIterator<ChatChunk> {
    // Implement streaming logic
    for await (const chunk of this.streamCustomAPI(messages, options)) {
      yield this.normalizeChunk(chunk);
    }
  }

  protected calculateCost(
    model: string,
    tokensIn: number,
    tokensOut: number
  ): number {
    // Implement cost calculation
    return 0;
  }

  getModelInfo(model: string): any | null {
    // Return model information
    return null;
  }

  validateConfig(): boolean {
    return !!this.config.apiKey;
  }

  async testConnection(): Promise<boolean> {
    // Test provider connectivity
    return true;
  }
}
```

### 2. Register Provider

```typescript
// src/lib/core/router.ts
import { CustomProvider } from '@/lib/providers/custom';

export class SmartRouter {
  private providers: Map<string, Provider> = new Map();

  constructor() {
    this.registerProviders();
  }

  private registerProviders() {
    // Register custom provider
    this.providers.set(
      'custom',
      new CustomProvider({
        apiKey: process.env.CUSTOM_API_KEY,
        baseURL: process.env.CUSTOM_BASE_URL,
      })
    );
  }
}
```

### 3. Update Configuration

Add provider configuration to environment variables:

```env
CUSTOM_API_KEY=your-api-key
CUSTOM_BASE_URL=https://api.custom.com
```

## 🔌 Adding a New Integration

### 1. Create Integration Class

```typescript
// src/lib/integrations/servicenow.ts
import { BaseIntegration } from './base';
import { IntegrationConfig } from '@/lib/types/integrations';

export class ServiceNowIntegration extends BaseIntegration {
  readonly name = 'servicenow';
  readonly type = 'ticketing';

  constructor(config: IntegrationConfig) {
    super(config);
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await this.client.get('/api/now/table/sys_user');
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async createTicket(ticket: any): Promise<any> {
    const response = await this.client.post('/api/now/table/incident', ticket);
    return response.data;
  }

  async getTicket(id: string): Promise<any> {
    const response = await this.client.get(`/api/now/table/incident/${id}`);
    return response.data;
  }
}
```

### 2. Register Integration

```typescript
// src/lib/integrations/registry.ts
import { ServiceNowIntegration } from './servicenow';

export class IntegrationRegistry {
  private integrations: Map<string, BaseIntegration> = new Map();

  constructor() {
    this.registerIntegrations();
  }

  private registerIntegrations() {
    this.integrations.set(
      'servicenow',
      new ServiceNowIntegration({
        baseUrl: process.env.SERVICENOW_URL,
        username: process.env.SERVICENOW_USERNAME,
        password: process.env.SERVICENOW_PASSWORD,
      })
    );
  }
}
```

## 🚩 Feature Flag System

### Configuration

Feature flags are configured via environment variables and database settings:

```env
# Feature flags
FEATURE_CHAT_ENABLED=true
FEATURE_KNOWLEDGE_BASE_ENABLED=true
FEATURE_SANITIZATION_ENABLED=true
FEATURE_SMART_ROUTING_ENABLED=true
```

### Usage in Code

```typescript
import { featureFlagMiddleware } from '@/lib/middleware/feature-flag';

export async function POST(request: NextRequest) {
  const featureFlags = await featureFlagMiddleware(request);

  if (!featureFlags.chatEnabled) {
    return NextResponse.json(
      { error: 'Chat feature is disabled' },
      { status: 403 }
    );
  }

  // Continue with chat logic
}
```

### Database-Driven Flags

```typescript
// Check feature flags from database
const flags = await getFeatureFlags(organizationId);
if (!flags.smartRouting) {
  throw new FeatureNotAvailableError('smart_routing');
}
```

## 🌍 Deployment Modes

### Cloud Mode

- External AI providers (OpenAI, Anthropic, Google)
- Cloud-based data storage
- SaaS licensing model
- Limited data sanitization

### Self-Hosted Mode

- All features enabled
- Local AI models (Ollama)
- On-premises data storage
- Full data sanitization
- Enterprise licensing

### Air-Gapped Mode

- Completely offline operation
- Local models only
- No external API calls
- Maximum security and compliance
- Government/defense use cases

### Mode Detection

```typescript
// Check deployment mode
const deploymentMode = process.env.DEPLOYMENT_MODE || 'self-hosted';

switch (deploymentMode) {
  case 'cloud':
    // Enable cloud-specific features
    break;
  case 'self-hosted':
    // Enable all features
    break;
  case 'airgap':
    // Disable external connections
    break;
}
```

## 🔒 Security Features

### Data Sanitization

Automatic detection and tokenization of sensitive data:

- **PII**: Names, emails, phone numbers, SSNs
- **PHI**: Medical records, patient IDs, diagnoses
- **Financial**: Credit cards, bank accounts, routing numbers
- **Government**: Passports, licenses, clearances

### Encryption

- End-to-end encryption for sensitive data
- Token mapping encryption
- Secure key rotation
- Hardware security module (HSM) support

### Audit Logging

Comprehensive audit trail for compliance:

- All API requests and responses
- Data access and modifications
- Security events and anomalies
- User actions and permissions

## 📊 Monitoring and Metrics

### Health Checks

**GET** `/api/v1/admin/health`

System health status with detailed component checks.

### Metrics

**GET** `/api/v1/admin/metrics`

Prometheus-compatible metrics for monitoring.

### Usage Analytics

Real-time usage tracking and cost analysis.

## 🧪 Testing

### Unit Tests

```bash
pnpm test
```

### Integration Tests

```bash
pnpm test:integration
```

### Load Testing

```bash
pnpm test:load
```

## 📖 API Documentation

Interactive API documentation available at `/api/docs` when running in development mode.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

Proprietary - Node2AI Enterprise Platform

## 🆘 Support

For support and questions:

- Email: support@node2.ai
- Documentation: https://docs.node2.ai
- Issues: GitHub Issues
