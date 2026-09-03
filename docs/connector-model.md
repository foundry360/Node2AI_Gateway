# Connector Model

**Status:** Architectural contract  
**Phase:** Abstraction only until post–MVP connector work

## Purpose

Provide a uniform, policy-mediated way to retrieve enterprise data. Connectors never authorize themselves.

```text
Request needs data
  → Connector.fetch (metadata + content)
  → Interrogation
  → PolicyEngine
  → Transform / allow / block
```

## Interface (logical)

```text
DataSourceConnector
  source_id
  source_type
  listDatasets()
  getMetadata(dataset_id) → { dataset, classification, owner, permissions }
  fetch(dataset_id, query, identity_context) → payload
```

## Planned source types

Salesforce, Epic, SharePoint, SQL, Files, REST APIs, Databases, Object Storage.

## MCP

MCP is **optional** and is **not** the governance boundary. Future shape:

```text
AI Agent → MCP → Node2AI Gateway → Policy → Approved Tool / Data Source
```

## Non-goals for early phases

- Deep vendor SDKs
- Treating connector classification as sole policy input
- Caching full enterprise records as SoR
