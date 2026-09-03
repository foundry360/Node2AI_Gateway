# Node2AI Comprehensive Architecture

## Executive Summary

Node2AI is a comprehensive enterprise AI orchestration platform designed for regulated industries (healthcare, finance, government). It provides a unified interface for multiple AI providers while maintaining strict data privacy, compliance, and audit trail requirements through blockchain technology.

**Key Capabilities:**

- Multi-provider AI orchestration (OpenAI, Anthropic, Google, Perplexity, Local)
- Advanced data sanitization (PII, PHI, Financial, Government)
- Immutable audit trails via Hyperledger Fabric blockchain
- Enterprise-grade security and compliance (HIPAA, GDPR, SOX)
- Real-time analytics and monitoring
- BYOK (Bring Your Own Key) architecture

---

## System Architecture Overview

### High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Dashboard<br/>Next.js 14<br/>Port 3000]
        API_CLIENTS[API Clients<br/>REST/OpenAI Compatible]
        MOBILE[Mobile Apps<br/>SDK Integration]
    end

    subgraph "API Gateway Layer"
        API[API Gateway<br/>Next.js 14<br/>Port 3001]
        ROUTES[REST API Routes<br/>/api/v1/*]
        MIDDLEWARE[Middleware Stack<br/>Auth, Rate Limit, Audit]
    end

    subgraph "Core Services Layer"
        ROUTER[Smart Router<br/>Provider Selection]
        SANITIZER[Data Sanitizer<br/>PII/PHI Detection]
        AUDIT[Audit Service<br/>Logging & Compliance]
        BLOCKCHAIN[Blockchain Service<br/>Hyperledger Fabric]
        STORAGE[Storage Service<br/>AI Interactions]
        ANALYTICS[Analytics Engine<br/>Metrics & Reporting]
        RAG[RAG Service<br/>Knowledge Base]
    end

    subgraph "Data Layer"
        POSTGRES[(PostgreSQL<br/>pgvector extension)]
        REDIS[(Redis Cache<br/>Sessions & Rate Limits)]
    end

    subgraph "Blockchain Layer"
        FABRIC[Hyperledger Fabric<br/>node2aichannel]
        PEER1[Peer Org1<br/>peer0.org1.example.com]
        PEER2[Peer Org2<br/>peer0.org2.example.com]
        ORDERER[Orderer<br/>orderer.example.com]
        EXPLORER[Hyperledger Explorer<br/>Port 8090]
        CHAINCODE[Chaincode<br/>audit-trail.go]
    end

    subgraph "AI Providers"
        OPENAI[OpenAI<br/>GPT Models]
        ANTHROPIC[Anthropic<br/>Claude Models]
        GOOGLE[Google AI<br/>Gemini Models]
        PERPLEXITY[Perplexity<br/>Real-time Search]
        LOCAL[Local Models<br/>Ollama]
    end

    WEB --> API
    API_CLIENTS --> API
    MOBILE --> API

    API --> MIDDLEWARE
    MIDDLEWARE --> ROUTES

    ROUTES --> ROUTER
    ROUTES --> SANITIZER
    ROUTES --> AUDIT
    ROUTES --> BLOCKCHAIN
    ROUTES --> STORAGE
    ROUTES --> ANALYTICS
    ROUTES --> RAG

    AUDIT --> POSTGRES
    AUDIT --> BLOCKCHAIN
    STORAGE --> POSTGRES
    RAG --> POSTGRES
    API --> REDIS

    BLOCKCHAIN --> FABRIC
    FABRIC --> PEER1
    FABRIC --> PEER2
    FABRIC --> ORDERER
    FABRIC --> CHAINCODE
    EXPLORER --> FABRIC

    ROUTER --> OPENAI
    ROUTER --> ANTHROPIC
    ROUTER --> GOOGLE
    ROUTER --> PERPLEXITY
    ROUTER --> LOCAL
```

### PlantUML Version

```plantuml
@startuml Node2AI_Architecture
!theme plain
skinparam componentStyle rectangle

package "Client Layer" {
  [Web Dashboard\nNext.js 14\nPort 3000] as Web
  [API Clients\nREST/OpenAI Compatible] as Clients
  [Mobile Apps\nSDK Integration] as Mobile
}

package "API Gateway Layer" {
  [API Gateway\nNext.js 14\nPort 3001] as API
  [REST API Routes\n/api/v1/*] as Routes
  [Middleware Stack\nAuth, Rate Limit, Audit] as MW
}

package "Core Services Layer" {
  [Smart Router\nProvider Selection] as Router
  [Data Sanitizer\nPII/PHI Detection] as Sanitizer
  [Audit Service\nLogging & Compliance] as Audit
  [Blockchain Service\nHyperledger Fabric] as Blockchain
  [Storage Service\nAI Interactions] as Storage
  [Analytics Engine\nMetrics & Reporting] as Analytics
  [RAG Service\nKnowledge Base] as RAG
}

database "Data Layer" {
  database "PostgreSQL\npgvector extension" as PG
  database "Redis Cache\nSessions & Rate Limits" as Redis
}

package "Blockchain Layer" {
  [Hyperledger Fabric\nnode2aichannel] as Fabric
  [Peer Org1\npeer0.org1.example.com] as Peer1
  [Peer Org2\npeer0.org2.example.com] as Peer2
  [Orderer\norderer.example.com] as Orderer
  [Hyperledger Explorer\nPort 8090] as Explorer
  [Chaincode\naudit-trail.go] as Chaincode
}

cloud "AI Providers" {
  [OpenAI\nGPT Models] as OpenAI
  [Anthropic\nClaude Models] as Anthropic
  [Google AI\nGemini Models] as Google
  [Perplexity\nReal-time Search] as Perplexity
  [Local Models\nOllama] as Local
}

Web --> API
Clients --> API
Mobile --> API

API --> MW
MW --> Routes

Routes --> Router
Routes --> Sanitizer
Routes --> Audit
Routes --> Blockchain
Routes --> Storage
Routes --> Analytics
Routes --> RAG

Audit --> PG
Audit --> Blockchain
Storage --> PG
RAG --> PG
API --> Redis

Blockchain --> Fabric
Fabric --> Peer1
Fabric --> Peer2
Fabric --> Orderer
Fabric --> Chaincode
Explorer --> Fabric

Router --> OpenAI
Router --> Anthropic
Router --> Google
Router --> Perplexity
Router --> Local

@enduml
```

---

## Detailed Component Architecture

### Frontend Layer (Presentation)

```mermaid
graph LR
    subgraph "Web Application (apps/web)"
        CONTROL[Control Center<br/>Dashboard & Monitoring]
        COMPLIANCE[Compliance Page<br/>Audit Logs & Blockchain]
        PROVIDERS[Provider Management<br/>API Keys & Testing]
        USERS[User Management<br/>RBAC & Permissions]
        ANALYTICS[Analytics Dashboard<br/>Costs & Usage]
        SANITIZATION[Sanitization Test<br/>PII/PHI Detection]
        CHAT[Chat Interface<br/>AI Interactions]
    end

    subgraph "Technologies"
        NEXTJS[Next.js 14<br/>React 18<br/>TypeScript]
        TAILWIND[Tailwind CSS<br/>Dark Mode]
        RECOIL[Recoil State Management]
        REACT_QUERY[React Query<br/>Data Fetching]
    end

    CONTROL --> NEXTJS
    COMPLIANCE --> NEXTJS
    PROVIDERS --> NEXTJS
    USERS --> NEXTJS
    ANALYTICS --> NEXTJS
    SANITIZATION --> NEXTJS
    CHAT --> NEXTJS
```

**Key Components:**

- **Control Center** (`/`): Real-time system monitoring, health checks, active requests
- **Compliance Page** (`/compliance`): Audit logs, blockchain transaction viewer, PHI detection
- **Provider Keys** (`/providers`): API key management for AI providers
- **Test Sanitization** (`/test-sanitization`): Interactive PII/PHI detection testing
- **User Management**: Role-based access control, organization management

---

### API Gateway Layer

```mermaid
graph TB
    subgraph "API Gateway (apps/api)"
        subgraph "Request Flow"
            IN[Incoming Request]
            MIDDLEWARE[Middleware Chain]
            ROUTE[API Route Handler]
            SERVICE[Service Layer]
            RESPONSE[Response]
        end

        subgraph "Middleware Stack"
            AUTH[Auth Middleware<br/>JWT/API Key]
            RATE[Rate Limit Middleware<br/>Redis-backed]
            AUDIT_MW[Audit Log Middleware<br/>Request Logging]
            LICENSE[License Middleware<br/>Feature Gating]
            CORS[CORS Middleware<br/>Cross-Origin]
        end

        subgraph "API Routes (v1)"
            CHAT[/chat/completions<br/>AI Interactions]
            BLOCKCHAIN[/blockchain/audit/*<br/>Blockchain Queries]
            ANALYTICS_ROUTE[/analytics/*<br/>Metrics & Stats]
            PROVIDERS_ROUTE[/provider-keys/*<br/>Key Management]
            CONTROL_ROUTE[/control-center/*<br/>System Status]
            SANITIZE_ROUTE[/sanitization/*<br/>Data Sanitization]
        end
    end

    IN --> MIDDLEWARE
    MIDDLEWARE --> AUTH
    AUTH --> RATE
    RATE --> AUDIT_MW
    AUDIT_MW --> LICENSE
    LICENSE --> CORS
    CORS --> ROUTE
    ROUTE --> CHAT
    ROUTE --> BLOCKCHAIN
    ROUTE --> ANALYTICS_ROUTE
    ROUTE --> PROVIDERS_ROUTE
    ROUTE --> CONTROL_ROUTE
    ROUTE --> SANITIZE_ROUTE
    CHAT --> SERVICE
    SERVICE --> RESPONSE
```

**Key API Endpoints:**

- `/api/v1/chat/completions` - OpenAI-compatible chat completions
- `/api/v1/blockchain/audit/[requestId]` - Blockchain transaction queries
- `/api/v1/analytics/*` - Usage analytics and metrics
- `/api/v1/provider-keys/*` - AI provider key management
- `/api/v1/control-center/*` - System monitoring endpoints
- `/api/v1/sanitization/*` - Data sanitization services

---

### Core Services Layer

```mermaid
graph TB
    subgraph "Core Services"
        subgraph "Routing Services"
            SMART[Smart Router<br/>Multi-criteria Selection]
            CONTEXT[Context-Aware Router<br/>Prompt Analysis]
            BUDGET[Budget Router<br/>Cost Optimization]
            FALLBACK[Fallback Router<br/>Provider Failover]
        end

        subgraph "Security Services"
            SANITIZER[Data Sanitizer<br/>PII/PHI/Financial]
            ENCRYPTION[Encryption Service<br/>AES-256]
            CLASSIFIER[Data Classifier<br/>Sensitivity Levels]
            TOKENIZER[Token Mapping<br/>Reversible Obfuscation]
        end

        subgraph "Business Services"
            AUDIT_SVC[Audit Service<br/>Compliance Logging]
            BLOCKCHAIN_SVC[Blockchain Service<br/>Hyperledger Integration]
            STORAGE_SVC[Storage Service<br/>AI Interaction Persistence]
            ANALYTICS_SVC[Analytics Service<br/>Metrics & Reporting]
            RAG_SVC[RAG Service<br/>Document Processing]
            COST[Cost Calculator<br/>Usage Pricing]
        end

        subgraph "Auth Services"
            AUTH_SVC[Auth Service<br/>JWT/API Key]
            ORG_SVC[Organization Service<br/>Multi-tenancy]
            USER_SVC[User Service<br/>RBAC Management]
        end
    end

    SMART --> CONTEXT
    SMART --> BUDGET
    SMART --> FALLBACK

    SANITIZER --> CLASSIFIER
    SANITIZER --> TOKENIZER

    AUDIT_SVC --> BLOCKCHAIN_SVC
    AUDIT_SVC --> STORAGE_SVC
```

---

### Data Layer Architecture

```mermaid
graph TB
    subgraph "PostgreSQL Database"
        ORGS[(organizations<br/>Multi-tenant Data)]
        USERS_TBL[(users<br/>RBAC & Permissions)]
        API_KEYS_TBL[(api_keys<br/>Service Authentication)]
        PROVIDER_KEYS_TBL[(provider_keys<br/>AI Provider Credentials)]
        AUDIT_LOGS_TBL[(audit_logs<br/>Compliance Trail)]
        AI_INTERACTIONS_TBL[(ai_interactions<br/>Chat History)]
        TOKEN_MAPPINGS_TBL[(token_mappings<br/>Sanitization Maps)]
        CONVERSATIONS_TBL[(conversation_sessions<br/>Chat Context)]
        VECTORS[(pgvector<br/>Embeddings for RAG)]
    end

    subgraph "Redis Cache"
        SESSIONS[(User Sessions<br/>JWT Tokens)]
        RATE_LIMITS[(Rate Limits<br/>Request Throttling)]
        TOKEN_MAPS_CACHE[(Token Mappings<br/>In-Memory)]
    end

    AUDIT_LOGS_TBL --> BLOCKCHAIN[Blockchain Service]
    AI_INTERACTIONS_TBL --> VECTORS
```

**Database Schema Highlights:**

- **Organizations**: Multi-tenant isolation, license management
- **Users**: Role-based access (admin, operator, viewer, auditor)
- **API Keys**: Service-to-service authentication
- **Provider Keys**: Encrypted AI provider credentials (BYOK)
- **Audit Logs**: Comprehensive activity tracking
- **AI Interactions**: Complete chat history with sanitization states
- **Token Mappings**: Reversible PII/PHI obfuscation
- **pgvector**: Vector embeddings for RAG capabilities

---

### Blockchain Integration Architecture

```mermaid
graph TB
    subgraph "Node2AI Application"
        BLOCKCHAIN_SVC[Blockchain Service<br/>apps/api/src/lib/blockchain]
        FABRIC_ADAPTER[Fabric Adapter<br/>SDK Wrapper]
        CHAINCODE_SDK[Chaincode SDK<br/>Go Client]
    end

    subgraph "Hyperledger Fabric Network"
        CHANNEL[node2aichannel<br/>Application Channel]

        subgraph "Organization 1"
            PEER1[peer0.org1.example.com<br/>Port 7051]
            CA1[CA Org1<br/>Certificate Authority]
            WALLET1[Wallet<br/>Identity Storage]
        end

        subgraph "Organization 2"
            PEER2[peer0.org2.example.com<br/>Port 9051]
            CA2[CA Org2<br/>Certificate Authority]
            WALLET2[Wallet<br/>Identity Storage]
        end

        ORDERER[orderer.example.com<br/>Port 7050<br/>Consensus Service]
    end

    subgraph "Chaincode"
        CHAINCODE[node2ai Chaincode<br/>audit-trail.go<br/>Go Smart Contract]
    end

    subgraph "Blockchain Explorer"
        EXPLORER[Hyperledger Explorer<br/>Port 8090<br/>Web UI]
        EXPLORER_DB[(Explorer Database<br/>Transaction Index)]
    end

    BLOCKCHAIN_SVC --> FABRIC_ADAPTER
    FABRIC_ADAPTER --> CHAINCODE_SDK
    CHAINCODE_SDK --> CHANNEL

    CHANNEL --> PEER1
    CHANNEL --> PEER2
    CHANNEL --> ORDERER

    PEER1 --> CHAINCODE
    PEER2 --> CHAINCODE
    PEER1 --> CA1
    PEER2 --> CA2

    FABRIC_ADAPTER --> WALLET1

    EXPLORER --> CHANNEL
    EXPLORER --> EXPLORER_DB
```

**Blockchain Components:**

- **Network**: `node2aichannel` with 2 organizations (Org1, Org2)
- **Chaincode**: `node2ai` version 1.1 (audit-trail.go)
- **Identity Management**: Wallet stores `appUser` identity
- **Transaction Flow**: RecordInteraction → QueryInteraction → Compliance Verification
- **Explorer**: Real-time transaction viewer and blockchain state

---

## Data Flow Diagrams

### Chat Completion Request Flow

```mermaid
sequenceDiagram
    participant User
    participant WebApp
    participant APIGateway
    participant AuthMiddleware
    participant Sanitizer
    participant SmartRouter
    participant AIProvider
    participant Blockchain
    participant Database

    User->>WebApp: Send Chat Message
    WebApp->>APIGateway: POST /api/v1/chat/completions
    APIGateway->>AuthMiddleware: Validate JWT/API Key

    AuthMiddleware->>Database: Verify Credentials
    Database-->>AuthMiddleware: User/Org Context
    AuthMiddleware-->>APIGateway: Authenticated Request

    APIGateway->>Sanitizer: Sanitize Input (PII/PHI)
    Sanitizer-->>APIGateway: Sanitized Prompt + Token Map

    APIGateway->>SmartRouter: Select Provider
    SmartRouter->>Database: Check Provider Status
    SmartRouter-->>APIGateway: Selected Provider

    APIGateway->>AIProvider: Send Sanitized Request
    AIProvider-->>APIGateway: AI Response

    APIGateway->>Sanitizer: Sanitize Output
    Sanitizer-->>APIGateway: Sanitized Response + Token Map

    APIGateway->>Blockchain: Record Transaction
    Blockchain-->>APIGateway: Transaction ID

    APIGateway->>Database: Store Interaction
    Database-->>APIGateway: Stored

    APIGateway->>Sanitizer: Desanitize for User
    Sanitizer-->>APIGateway: User-Friendly Response

    APIGateway-->>WebApp: Response + Metadata
    WebApp-->>User: Display Response
```

### Blockchain Recording Flow

```mermaid
sequenceDiagram
    participant APIRoute
    participant BlockchainService
    participant FabricAdapter
    participant FabricNetwork
    participant Chaincode
    participant Peers
    participant Orderer
    participant Explorer

    APIRoute->>BlockchainService: recordAuditEvent(event)
    BlockchainService->>BlockchainService: Hash Input Data
    BlockchainService->>BlockchainService: Generate Merkle Root

    BlockchainService->>FabricAdapter: connect()
    FabricAdapter->>FabricNetwork: Gateway.connect()
    FabricNetwork-->>FabricAdapter: Network Connection

    FabricAdapter->>FabricNetwork: Get Contract (node2ai)
    FabricNetwork-->>FabricAdapter: Contract Instance

    FabricAdapter->>Chaincode: submitTransaction(RecordInteraction)
    Chaincode->>Peers: Endorse Transaction
    Peers-->>Chaincode: Endorsement Responses

    Chaincode->>Orderer: Submit to Orderer
    Orderer->>Orderer: Order & Create Block
    Orderer->>Peers: Deliver Block

    Peers->>Chaincode: Commit to Ledger
    Chaincode-->>FabricAdapter: Transaction ID

    FabricAdapter-->>BlockchainService: Transaction ID
    BlockchainService-->>APIRoute: Blockchain TX ID

    Explorer->>FabricNetwork: Sync Blocks
    FabricNetwork-->>Explorer: Block Data
    Explorer->>Explorer: Index Transactions
```

---

## Technology Stack

### Frontend Stack

- **Framework**: Next.js 14 (App Router)
- **UI Library**: React 18
- **Language**: TypeScript 5+
- **Styling**: Tailwind CSS (Dark Mode)
- **State Management**: Recoil
- **Data Fetching**: React Query
- **Charts**: Recharts

### Backend Stack

- **Framework**: Next.js 14 (API Routes)
- **Language**: TypeScript 5+ (Strict Mode)
- **Runtime**: Node.js 18+
- **Package Manager**: pnpm 8+

### Data Stack

- **Primary Database**: PostgreSQL 15+ with pgvector extension
- **Cache**: Redis 7+ (Sessions, Rate Limiting)
- **Native Auth**: Password hashing (bcrypt) + JWT-based sessions stored in PostgreSQL

### Blockchain Stack

- **Framework**: Hyperledger Fabric 2.5
- **Network**: Test Network (Development) / Production Network
- **Chaincode**: Go 1.21+
- **SDK**: Fabric Node.js SDK
- **Explorer**: Hyperledger Explorer 2.0

### AI Provider Integrations

- **OpenAI**: GPT-4, GPT-3.5-turbo
- **Anthropic**: Claude 3 (Opus, Sonnet, Haiku)
- **Google**: Gemini Pro, Gemini Ultra
- **Perplexity**: Real-time search models
- **Local**: Ollama (Llama 2, Mistral, etc.)

### Security & Compliance

- **Authentication**: JWT, API Keys, SSO (SAML, OAuth2)
- **Encryption**: AES-256, TLS 1.3
- **Data Sanitization**: Proprietary PII/PHI detection
- **Compliance**: HIPAA, GDPR, SOX ready

---

## Deployment Architecture

### Development Environment

```mermaid
graph TB
    subgraph "Local Development"
        WEB_DEV[Web Dev Server<br/>pnpm dev :3000]
        API_DEV[API Dev Server<br/>pnpm dev :3001]
        POSTGRES_DEV[(PostgreSQL<br/>Docker :5432)]
        REDIS_DEV[(Redis<br/>Docker :6379)]
        FABRIC[Fabric Test Network<br/>Docker Compose]
        EXPLORER[Explorer<br/>Docker :8090]
    end

    WEB_DEV --> API_DEV
    API_DEV --> POSTGRES_DEV
    API_DEV --> REDIS_DEV
    API_DEV --> FABRIC
    EXPLORER --> FABRIC
```

### Production Environment

```mermaid
graph TB
    subgraph "Internet"
        USERS[Users & API Clients]
    end

    subgraph "DMZ / Edge"
        FW_EXT[External Firewall<br/>Network Perimeter<br/>Port Filtering]
        WAF[Web Application Firewall<br/>WAF<br/>DDoS Protection]
        LB[Load Balancer<br/>HAProxy/Nginx]
        SSL[SSL/TLS Termination]
    end

    subgraph "Application Tier"
        FW_APP[Application Firewall<br/>Inter-zone Protection]
        NGINX[Nginx Reverse Proxy]

        subgraph "API Servers"
            API1[API Server 1<br/>Next.js]
            API2[API Server 2<br/>Next.js]
        end

        subgraph "Web Servers"
            WEB1[Web Server 1<br/>Next.js]
            WEB2[Web Server 2<br/>Next.js]
        end
    end

    subgraph "Service Tier"
        FW_SVC[Service Firewall<br/>Blockchain Isolation]
        BLOCKCHAIN_NET[Hyperledger Fabric<br/>Production Network]
        EXPLORER_PROD[Hyperledger Explorer]
    end

    subgraph "Data Tier"
        FW_DB[Database Firewall<br/>SQL Injection Protection]
        POSTGRES_PRIMARY[(PostgreSQL Primary<br/>pgvector)]
        POSTGRES_REPLICA[(PostgreSQL Replica<br/>Read-only)]
        REDIS_CLUSTER[(Redis Cluster<br/>HA Mode)]
    end

    USERS --> FW_EXT
    FW_EXT --> WAF
    WAF --> LB
    LB --> SSL
    SSL --> FW_APP
    FW_APP --> NGINX
    NGINX --> API1
    NGINX --> API2
    NGINX --> WEB1
    NGINX --> WEB2

    API1 --> FW_DB
    API2 --> FW_DB
    FW_DB --> POSTGRES_PRIMARY
    FW_DB --> POSTGRES_REPLICA
    API1 --> REDIS_CLUSTER
    API2 --> REDIS_CLUSTER

    API1 --> FW_SVC
    API2 --> FW_SVC
    FW_SVC --> BLOCKCHAIN_NET
    EXPLORER_PROD --> FW_SVC
    FW_SVC --> BLOCKCHAIN_NET
```

---

## Security Architecture

### Network Security & Firewalls

```mermaid
graph TB
    subgraph "Internet"
        USERS[External Users]
        ATTACKERS[Potential Attackers]
    end

    subgraph "Perimeter Security"
        FW_EXT[External Firewall<br/>Port Filtering<br/>Geo-blocking]
        WAF[Web Application Firewall<br/>WAF Layer 7<br/>DDoS Protection]
    end

    subgraph "Application Tier Security"
        FW_APP[Application Firewall<br/>Inter-zone Isolation]
        NGINX[Nginx Reverse Proxy<br/>Request Filtering]
        RATE_LIMIT[Rate Limiting<br/>Redis-backed]
    end

    subgraph "Data Tier Security"
        FW_DB[Database Firewall<br/>SQL Injection Protection]
        ENCRYPTION[Encryption at Rest<br/>AES-256]
    end

    subgraph "Service Tier Security"
        FW_SVC[Service Firewall<br/>Blockchain Network Isolation]
        TLS[TLS 1.3<br/>All Connections]
    end

    USERS --> FW_EXT
    ATTACKERS -.->|Blocked| FW_EXT
    FW_EXT --> WAF
    WAF --> FW_APP
    FW_APP --> NGINX
    NGINX --> RATE_LIMIT
    RATE_LIMIT --> FW_DB
    FW_DB --> ENCRYPTION
    FW_APP --> FW_SVC
    FW_SVC --> TLS
```

**Firewall Placement:**

1. **External Firewall** (Network Perimeter)
   - Location: Between Internet and DMZ
   - Rules: Allow HTTP (80), HTTPS (443), deny all others
   - Features: Port filtering, geo-blocking, basic rate limiting

2. **Web Application Firewall (WAF)** (DMZ)
   - Location: After external firewall, before load balancer
   - Protection: SQL injection, XSS, DDoS mitigation, bot detection
   - Examples: Cloudflare, AWS WAF, ModSecurity

3. **Application Firewall** (Application Tier)
   - Location: Between DMZ and application servers
   - Purpose: Inter-zone isolation, application-level filtering
   - Rules: Service-to-service communication control

4. **Database Firewall** (Data Tier)
   - Location: Between application servers and databases
   - Protection: SQL injection prevention, query filtering
   - Access Control: Connection limits, IP whitelisting

5. **Service Firewall** (Service Tier)
   - Location: Around blockchain network
   - Purpose: Isolate blockchain from other services
   - Rules: Blockchain-specific port controls

### Authentication & Authorization Flow

```mermaid
graph TB
    subgraph "Authentication Methods"
        JWT[JWT Tokens<br/>Bearer Token]
        API_KEY[API Keys<br/>X-API-Key Header]
        SSO[SSO Integration<br/>SAML/OAuth2]
    end

    subgraph "Auth Middleware"
        VALIDATE[Validate Credentials]
        VERIFY_JWT[Verify JWT Signature]
        CHECK_API_KEY[Verify API Key Hash]
        CHECK_SSO[Verify SSO Token]
    end

    subgraph "Authorization"
        RBAC[Role-Based Access<br/>Admin/Operator/Viewer]
        ORG_ISOLATION[Organization Isolation<br/>Multi-tenant]
        FEATURE_FLAGS[Feature Flags<br/>License-based]
    end

    JWT --> VALIDATE
    API_KEY --> VALIDATE
    SSO --> VALIDATE

    VALIDATE --> VERIFY_JWT
    VALIDATE --> CHECK_API_KEY
    VALIDATE --> CHECK_SSO

    VERIFY_JWT --> RBAC
    CHECK_API_KEY --> RBAC
    CHECK_SSO --> RBAC

    RBAC --> ORG_ISOLATION
    ORG_ISOLATION --> FEATURE_FLAGS
```

### Data Sanitization Pipeline

```mermaid
graph LR
    INPUT[User Input]

    subgraph "Detection Phase"
        PII[PII Detection<br/>SSN, Email, Phone]
        PHI[PHI Detection<br/>MRN, DOB, Diagnosis]
        FINANCIAL[Financial Detection<br/>Credit Card, Bank Account]
        GOV[Government Detection<br/>Passport, SSN]
    end

    subgraph "Sanitization Phase"
        TOKENIZE[Token Mapping<br/>Reversible Obfuscation]
        HASH[Hash Generation<br/>SHA-256]
        CLASSIFY[Data Classification<br/>Sensitivity Levels]
    end

    subgraph "Storage Phase"
        SANITIZED[Sanitized Version<br/>Sent to AI]
        ORIGINAL[Original Version<br/>Encrypted Storage]
        TOKEN_MAP[Token Mapping<br/>Redis + DB]
    end

    INPUT --> PII
    INPUT --> PHI
    INPUT --> FINANCIAL
    INPUT --> GOV

    PII --> TOKENIZE
    PHI --> TOKENIZE
    FINANCIAL --> TOKENIZE
    GOV --> TOKENIZE

    TOKENIZE --> HASH
    HASH --> CLASSIFY

    CLASSIFY --> SANITIZED
    CLASSIFY --> ORIGINAL
    TOKENIZE --> TOKEN_MAP
```

---

## Network Topology

### PlantUML Network Diagram

```plantuml
@startuml Node2AI_Network_Topology
!theme plain
skinparam componentStyle rectangle

cloud "Internet" {
  [Users] as Users
  [AI Providers\nOpenAI, Anthropic, etc.] as Providers
}

rectangle "DMZ / Edge" {
  [External Firewall\nNetwork Perimeter\nPort Filtering] as FW_EXT
  [Web Application Firewall\nWAF\nDDoS Protection] as WAF
  [Load Balancer\nHAProxy/Nginx] as LB
  [SSL Termination] as SSL
}

rectangle "Application Tier" {
  [Application Firewall\nInter-zone Protection] as FW_APP
  [Nginx Reverse Proxy] as Nginx
  component "API Cluster" {
    [API Server 1\n:3001] as API1
    [API Server 2\n:3001] as API2
  }
  component "Web Cluster" {
    [Web Server 1\n:3000] as Web1
    [Web Server 2\n:3000] as Web2
  }
}

rectangle "Service Tier" {
  [Service Firewall\nBlockchain Isolation] as FW_SVC
  component "Hyperledger Fabric" {
    [Peer Org1\n:7051] as Peer1
    [Peer Org2\n:9051] as Peer2
    [Orderer\n:7050] as Orderer
  }
  [Explorer\n:8090] as Explorer
}

rectangle "Data Tier" {
  [Database Firewall\nSQL Injection Protection] as FW_DB
  database "PostgreSQL Cluster" {
    [Primary\n:5432] as PG1
    [Replica\n:5432] as PG2
  }
  database "Redis Cluster" {
    [Redis 1\n:6379] as R1
    [Redis 2\n:6379] as R2
  }
}

Users --> FW_EXT
FW_EXT --> WAF
WAF --> LB
LB --> SSL
SSL --> FW_APP
FW_APP --> Nginx
Nginx --> API1
Nginx --> API2
Nginx --> Web1
Nginx --> Web2

API1 --> FW_DB
API2 --> FW_DB
FW_DB --> PG1
FW_DB --> PG2
API1 --> R1
API2 --> R2

API1 --> FW_SVC
API2 --> FW_SVC
FW_SVC --> Peer1
FW_SVC --> Peer2
Peer1 --> Orderer
Peer2 --> Orderer
Explorer --> FW_SVC

API1 --> Providers
API2 --> Providers

note right of FW_EXT
  **Firewall Rules:**
  - Allow: HTTP (80), HTTPS (443)
  - Deny: All other ports
  - Rate limiting
  - Geo-blocking (optional)
end note

note right of WAF
  **WAF Protection:**
  - SQL Injection
  - XSS Protection
  - DDoS Mitigation
  - Bot Detection
  - API Abuse Prevention
end note

note right of FW_DB
  **Database Firewall:**
  - SQL Injection Protection
  - Query Filtering
  - Connection Limits
  - Access Control
end note

@enduml
```

---

## Integration Patterns

### Provider Integration Pattern

```mermaid
graph TB
    subgraph "Provider Abstraction"
        BASE[Base Provider Interface]
        OPENAI_IMPL[OpenAI Implementation]
        ANTHROPIC_IMPL[Anthropic Implementation]
        GOOGLE_IMPL[Google Implementation]
        PERPLEXITY_IMPL[Perplexity Implementation]
        LOCAL_IMPL[Local/Ollama Implementation]
    end

    subgraph "Provider Router"
        ROUTER[Smart Router<br/>Selection Logic]
        COST[Cost Calculator<br/>Pricing Models]
        QUALITY[Quality Metrics<br/>Response Scoring]
    end

    BASE --> OPENAI_IMPL
    BASE --> ANTHROPIC_IMPL
    BASE --> GOOGLE_IMPL
    BASE --> PERPLEXITY_IMPL
    BASE --> LOCAL_IMPL

    ROUTER --> COST
    ROUTER --> QUALITY
    ROUTER --> BASE
```

### Middleware Chain Pattern

```mermaid
graph LR
    REQ[Request] --> AUTH[Auth<br/>JWT/API Key]
    AUTH --> RATE[Rate Limit<br/>Redis-backed]
    RATE --> AUDIT[Audit Log<br/>Request Tracking]
    AUDIT --> LICENSE[License Check<br/>Feature Gating]
    LICENSE --> CORS[CORS<br/>Cross-Origin]
    CORS --> HANDLER[Route Handler]
    HANDLER --> RESP[Response]
```

---

## Component Details

### Smart Router Service

**Location**: `apps/api/src/lib/core/router.ts`

**Responsibilities**:

- Multi-criteria provider selection (cost, quality, latency)
- Fallback routing on provider failures
- Budget-aware routing
- Context-aware provider matching

**Selection Criteria**:

1. Cost optimization
2. Quality threshold
3. Latency requirements
4. Provider availability
5. Model capabilities

### Data Sanitization Service

**Location**: `packages/sanitization/`

**Capabilities**:

- PII Detection: SSN, Email, Phone, Address
- PHI Detection: MRN, DOB, Diagnosis, Treatment
- Financial Detection: Credit Cards, Bank Accounts, Tax IDs
- Government Detection: Passport, SSN, Security Clearance

**Sanitization Methods**:

- Tokenization (reversible)
- Hashing (SHA-256)
- Encryption (AES-256)
- Pattern replacement

### Blockchain Service

**Location**: `apps/api/src/lib/blockchain/blockchain.service.ts`

**Operations**:

- `recordAuditEvent()`: Record AI interaction to blockchain
- `queryAuditEvent()`: Query transaction by requestId
- `queryAuditEventsByOrg()`: Query by organization
- `queryAuditEventsByDateRange()`: Query by date range
- `verifyPHICompliance()`: Verify HIPAA compliance

**Chaincode Functions**:

- `RecordInteraction`: Store interaction on ledger
- `QueryInteraction`: Retrieve interaction data
- `QueryInteractionsByOrganization`: Filter by org
- `QueryInteractionsByDateRange`: Filter by date
- `GetInteractionHistory`: Get full history
- `VerifyPHICompliance`: Compliance verification

### Analytics Service

**Location**: `apps/api/src/lib/analytics/engine.ts`

**Metrics Tracked**:

- Request volume and trends
- Token usage per provider/model
- Cost tracking and optimization
- Response time analytics
- Error rates and patterns
- Sanitization effectiveness
- PHI detection rates

---

## Compliance & Audit Trail

### Audit Trail Components

1. **Database Audit Logs** (`audit_logs` table)
   - All API requests
   - User actions
   - System events
   - Security events

2. **Blockchain Audit Trail** (Hyperledger Fabric)
   - Immutable AI interaction records
   - Cryptographic verification
   - Tamper-proof history
   - Compliance validation

3. **AI Interaction Storage** (`ai_interactions` table)
   - Original prompts
   - Sanitized prompts
   - AI responses
   - Desanitized responses
   - Token mappings

### Compliance Features

- **HIPAA**: PHI protection, breach notification, audit trails
- **GDPR**: Right to be forgotten, data portability, consent management
- **SOX**: Financial controls, audit trails, change management
- **SOC 2**: Security controls, availability monitoring, confidentiality

---

## Monitoring & Observability

### Health Check Endpoints

- `/api/health` - Basic health check
- `/api/v1/control-center/dashboard` - System status
- `/api/v1/control-center/system-status` - Detailed metrics
- `/api/v1/control-center/error-rate` - Error monitoring
- `/api/v1/control-center/response-time` - Performance metrics

### Metrics Collected

- Request rates and throughput
- Response times (p50, p95, p99)
- Error rates and types
- Provider availability
- Blockchain transaction success rate
- Database query performance
- Cache hit rates

---

## Deployment Configurations

### Docker Compose

**Development**: `docker-compose.dev.yml`

- PostgreSQL with pgvector
- Redis cache
- Hot reload for development

**Production**: `docker-compose.prod.yml`

- High availability configuration
- SSL/TLS termination
- Load balancing
- Health checks

### Kubernetes

**Location**: `deployments/kubernetes/`

**Components**:

- API Gateway deployment
- Web application deployment
- PostgreSQL stateful set
- Redis cluster
- Hyperledger Fabric network
- Ingress controllers
- Service mesh (optional)

---

## Data Flow Examples

### Complete Request Lifecycle

1. **User Request** → Web Dashboard
2. **Authentication** → JWT validation
3. **Input Sanitization** → PII/PHI detection & tokenization
4. **Provider Selection** → Smart router decision
5. **AI Request** → Selected provider API
6. **Response Sanitization** → Output sanitization
7. **Blockchain Recording** → Immutable audit trail
8. **Database Storage** → Complete interaction record
9. **Response Desanitization** → User-friendly output
10. **User Display** → Formatted response

### Blockchain Sync Flow

1. **Transaction Submission** → Fabric adapter
2. **Endorsement** → Multiple peers validate
3. **Ordering** → Orderer creates block
4. **Commit** → Peers commit to ledger
5. **Explorer Sync** → Real-time indexing
6. **Query Interface** → Web UI access

---

## Scalability Considerations

### Horizontal Scaling

- **API Servers**: Stateless, can scale horizontally
- **Web Servers**: Stateless, can scale horizontally
- **Redis**: Cluster mode for high availability
- **PostgreSQL**: Read replicas for read scaling
- **Fabric Network**: Multi-peer deployment

### Performance Optimization

- Redis caching for frequent queries
- Database connection pooling
- Async blockchain operations
- Batch processing for analytics
- CDN for static assets

---

## Security Best Practices

1. **Encryption at Rest**: All sensitive data encrypted
2. **Encryption in Transit**: TLS 1.3 for all connections
3. **Key Management**: Secure storage of API keys and secrets
4. **Access Control**: Role-based permissions
5. **Audit Logging**: Complete activity tracking
6. **Rate Limiting**: Prevent abuse and DDoS
7. **Input Validation**: Sanitize all user inputs
8. **Secret Rotation**: Regular key rotation
9. **Vulnerability Scanning**: Automated security scanning
10. **Compliance Monitoring**: Continuous compliance checks

---

## Future Enhancements

- Multi-region deployment support
- Advanced RAG capabilities with vector databases
- Real-time collaboration features
- Mobile SDK improvements
- Enhanced analytics dashboards
- Machine learning model fine-tuning
- Custom chaincode capabilities
- Advanced compliance reporting

---

## Conclusion

Node2AI provides a comprehensive, enterprise-grade platform for AI orchestration with built-in security, compliance, and blockchain-backed audit trails. The architecture is designed for scalability, maintainability, and regulatory compliance, making it suitable for healthcare, financial, and government sectors.

**Key Strengths**:

- Unified interface for multiple AI providers
- Advanced data sanitization and privacy protection
- Immutable blockchain audit trails
- Enterprise-grade security and compliance
- Comprehensive monitoring and analytics
- Scalable and maintainable architecture

---

_Last Updated: November 2025_
_Version: 2.0_
