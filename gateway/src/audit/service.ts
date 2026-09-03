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
  /** SHA-256 of released response content (empty string hashed if blocked). */
  response_hash?: string;
  /** Previous event_hash in the appliance chain (GENESIS for first). */
  prev_event_hash?: string;
  /** SHA-256 over canonical event fields including response_hash. */
  event_hash?: string;
  /** HMAC-SHA256 of event_hash with appliance audit key. */
  integrity_signature?: string;
}

export interface AuditService {
  record(event: AuditEvent): Promise<AuditEvent>;
  list(): Promise<AuditEvent[]>;
}

export class InMemoryAuditService implements AuditService {
  private readonly events: AuditEvent[] = [];
  forceFailure = false;

  async record(event: AuditEvent): Promise<AuditEvent> {
    if (this.forceFailure) {
      throw new Error('Audit write failed');
    }
    this.events.push(event);
    return event;
  }

  async list(): Promise<AuditEvent[]> {
    return [...this.events];
  }
}
