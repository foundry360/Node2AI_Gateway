import type { PgQueryable } from '../shared/pg.js';
import type {
  EvidenceAnchorPayload,
  EvidenceAnchorRecord,
  AnchorStatus,
  AnchorType,
} from './anchor.js';

export interface EvidenceAnchorRepository {
  append(record: EvidenceAnchorRecord): Promise<void>;
  list(deploymentId?: string): Promise<EvidenceAnchorRecord[]>;
  latestByCheckpoint(checkpointId: string): Promise<EvidenceAnchorRecord | null>;
  latestAnchored(deploymentId: string): Promise<EvidenceAnchorRecord | null>;
}

function mapRow(row: Record<string, unknown>): EvidenceAnchorRecord {
  return {
    anchor_record_id: String(row.anchor_record_id),
    anchor_id: String(row.anchor_id),
    deployment_id: String(row.deployment_id),
    checkpoint_id: String(row.checkpoint_id),
    sequence_start: Number(row.sequence_start),
    sequence_end: Number(row.sequence_end),
    event_count: Number(row.event_count),
    root_hash: String(row.root_hash),
    checkpoint_signature: String(row.checkpoint_signature),
    checkpoint_key_id: String(row.checkpoint_key_id),
    canonical_version: Number(row.canonical_version),
    recorded_at:
      row.recorded_at instanceof Date
        ? row.recorded_at.toISOString()
        : String(row.recorded_at),
    anchored_at: row.anchored_at
      ? row.anchored_at instanceof Date
        ? row.anchored_at.toISOString()
        : String(row.anchored_at)
      : null,
    anchor_type: String(row.anchor_type) as AnchorType,
    anchor_uri: row.anchor_uri ? String(row.anchor_uri) : null,
    anchor_hash: row.anchor_hash ? String(row.anchor_hash) : null,
    anchor_status: String(row.anchor_status) as AnchorStatus,
    failure_code: row.failure_code ? String(row.failure_code) : null,
    payload_json: row.payload_json as EvidenceAnchorPayload,
  };
}

export class InMemoryEvidenceAnchorRepository implements EvidenceAnchorRepository {
  private readonly rows: EvidenceAnchorRecord[] = [];

  async append(record: EvidenceAnchorRecord): Promise<void> {
    if (
      record.anchor_status === 'ANCHORED' &&
      this.rows.some(
        (r) =>
          r.checkpoint_id === record.checkpoint_id && r.anchor_status === 'ANCHORED',
      )
    ) {
      throw new Error('duplicate ANCHORED for checkpoint');
    }
    this.rows.push(record);
  }

  async list(deploymentId?: string): Promise<EvidenceAnchorRecord[]> {
    return deploymentId
      ? this.rows.filter((r) => r.deployment_id === deploymentId)
      : [...this.rows];
  }

  async latestByCheckpoint(checkpointId: string): Promise<EvidenceAnchorRecord | null> {
    const matches = this.rows.filter((r) => r.checkpoint_id === checkpointId);
    return matches.at(-1) ?? null;
  }

  async latestAnchored(deploymentId: string): Promise<EvidenceAnchorRecord | null> {
    const matches = this.rows.filter(
      (r) => r.deployment_id === deploymentId && r.anchor_status === 'ANCHORED',
    );
    return matches.sort((a, b) => a.sequence_end - b.sequence_end).at(-1) ?? null;
  }
}

export class PostgresEvidenceAnchorRepository implements EvidenceAnchorRepository {
  constructor(private readonly db: PgQueryable) {}

  async append(record: EvidenceAnchorRecord): Promise<void> {
    await this.db.query(
      `INSERT INTO audit_evidence_anchors (
         anchor_record_id, anchor_id, deployment_id, checkpoint_id,
         sequence_start, sequence_end, event_count, root_hash,
         checkpoint_signature, checkpoint_key_id, canonical_version,
         recorded_at, anchored_at, anchor_type, anchor_uri, anchor_hash,
         anchor_status, failure_code, payload_json
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
         $12::timestamptz,$13::timestamptz,$14,$15,$16,$17,$18,$19::jsonb
       )`,
      [
        record.anchor_record_id,
        record.anchor_id,
        record.deployment_id,
        record.checkpoint_id,
        record.sequence_start,
        record.sequence_end,
        record.event_count,
        record.root_hash,
        record.checkpoint_signature,
        record.checkpoint_key_id,
        record.canonical_version,
        record.recorded_at,
        record.anchored_at,
        record.anchor_type,
        record.anchor_uri,
        record.anchor_hash,
        record.anchor_status,
        record.failure_code,
        JSON.stringify(record.payload_json),
      ],
    );
  }

  async list(deploymentId?: string): Promise<EvidenceAnchorRecord[]> {
    const res = deploymentId
      ? await this.db.query(
          `SELECT * FROM audit_evidence_anchors WHERE deployment_id = $1 ORDER BY recorded_at ASC`,
          [deploymentId],
        )
      : await this.db.query(
          `SELECT * FROM audit_evidence_anchors ORDER BY recorded_at ASC`,
        );
    return res.rows.map((r) => mapRow(r as Record<string, unknown>));
  }

  async latestByCheckpoint(checkpointId: string): Promise<EvidenceAnchorRecord | null> {
    const res = await this.db.query(
      `SELECT * FROM audit_evidence_anchors
       WHERE checkpoint_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [checkpointId],
    );
    return res.rows[0] ? mapRow(res.rows[0] as Record<string, unknown>) : null;
  }

  async latestAnchored(deploymentId: string): Promise<EvidenceAnchorRecord | null> {
    const res = await this.db.query(
      `SELECT * FROM audit_evidence_anchors
       WHERE deployment_id = $1 AND anchor_status = 'ANCHORED'
       ORDER BY sequence_end DESC, recorded_at DESC
       LIMIT 1`,
      [deploymentId],
    );
    return res.rows[0] ? mapRow(res.rows[0] as Record<string, unknown>) : null;
  }
}
