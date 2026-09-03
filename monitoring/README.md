# Node2AI Monitoring & Observability

Monitoring configuration for Node2AI Enterprise using Prometheus and Grafana.

## Components

- **Prometheus**: Metrics collection and alerting
- **Grafana**: Visualization and dashboards
- **Alertmanager**: Alert routing and notification

## Quick Start

### Docker Deployment

```bash
# Add monitoring to docker-compose
docker-compose -f docker-compose.yml -f docker-compose.monitoring.yml up -d
```

### Kubernetes Deployment

```bash
# Apply monitoring manifests
kubectl apply -f monitoring/prometheus/
kubectl apply -f monitoring/grafana/
```

## Metrics

### Available Metrics

Node2AI exposes the following metrics:

**API Metrics:**

- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request duration histogram
- `node2ai_ai_requests_total` - Total AI provider requests
- `node2ai_sanitization_events_total` - Data sanitization events
- `node2ai_blockchain_transactions_total` - Blockchain transactions

**System Metrics:**

- CPU usage
- Memory usage
- Disk I/O
- Network I/O

**Database Metrics:**

- Connection pool usage
- Query performance
- Replication lag (if applicable)

**Cache Metrics:**

- Hit/miss rates
- Memory usage
- Eviction counts

## Dashboards

### Node2AI Dashboard

The default dashboard (`node2ai-dashboard.json`) includes:

- **Overview**: System health, request rates, error rates
- **Performance**: Latency percentiles, throughput
- **AI Providers**: Provider usage, costs, success rates
- **Data Sanitization**: PII/PHI detection statistics
- **Blockchain**: Transaction volume, audit trail stats
- **Infrastructure**: CPU, memory, disk, network

### Accessing Grafana

1. Navigate to Grafana: `http://localhost:3001` (or your configured domain)
2. Default credentials:
   - Username: `admin`
   - Password: `admin` (change on first login)

## Alerts

Alerts are configured in `prometheus/alerts.yml`:

- **Critical**: Service down, database unavailable
- **Warning**: High error rates, high latency, resource exhaustion

### Alert Channels

Configure alert channels in Alertmanager:

- Email
- Slack
- PagerDuty
- Webhooks

## Custom Metrics

To add custom metrics in your application:

```typescript
import { prometheus } from '@prometheus/client';

const httpRequestsTotal = new prometheus.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

// Increment counter
httpRequestsTotal.inc({ method: 'GET', route: '/api/health', status: '200' });
```

## Troubleshooting

### Prometheus Not Scraping

1. Check service discovery: `http://prometheus:9090/targets`
2. Verify network connectivity
3. Check metric endpoints are accessible

### Grafana Not Loading Dashboards

1. Verify Prometheus datasource is configured
2. Check dashboard JSON is valid
3. Verify Grafana has access to Prometheus

### Alerts Not Firing

1. Check alert rules syntax
2. Verify Alertmanager is running
3. Check alert evaluation: `http://prometheus:9090/alerts`

## Support

For monitoring help:

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Node2AI Documentation](../docs/administration/monitoring.md)
