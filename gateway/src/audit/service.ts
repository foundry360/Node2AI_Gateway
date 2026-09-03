export interface AuditEvent {
  audit_id: string;
  timestamp: string;
  organization_id?: string;
  application_id?: string;
  user_id?: string;
  request_id: string;
  correlation_id: string;
  operation?: string;
  data_classification?: string;
  policy_ids?: string[];
  policy_decision?: string;
  model_selected?: string;
  provider?: string;
  input_transformation?: string;
  response_transformation?: string;
  response_decision?: string;
  latency_ms?: number;
  usage?: Record<string, number>;
  reason_codes?: string[];
  errors?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AuditService {
  record(event: AuditEvent): Promise<void>;
  list(): Promise<AuditEvent[]>;
}

export class InMemoryAuditService implements AuditService {
  private readonly events: AuditEvent[] = [];
  forceFailure = false;

  async record(event: AuditEvent): Promise<void> {
    if (this.forceFailure) {
      throw new Error('Audit write failed');
    }
    this.events.push(event);
  }

  async list(): Promise<AuditEvent[]> {
    return [...this.events];
  }
}
