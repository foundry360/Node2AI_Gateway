import type { PgQueryable } from '../shared/pg.js';

export interface AuditSequenceAllocator {
  nextSequence(deploymentId: string): Promise<number>;
}

/** In-memory allocator for tests / memory mode. */
export class InMemoryAuditSequenceAllocator implements AuditSequenceAllocator {
  private readonly counters = new Map<string, number>();

  async nextSequence(deploymentId: string): Promise<number> {
    const next = (this.counters.get(deploymentId) ?? 0) + 1;
    this.counters.set(deploymentId, next);
    return next;
  }
}

/**
 * Postgres allocator — concurrent-safe via upsert + RETURNING.
 */
export class PostgresAuditSequenceAllocator implements AuditSequenceAllocator {
  constructor(private readonly db: PgQueryable) {}

  async nextSequence(deploymentId: string): Promise<number> {
    const res = await this.db.query(
      `INSERT INTO audit_ledger_counters (deployment_id, next_sequence)
       VALUES ($1, 2)
       ON CONFLICT (deployment_id) DO UPDATE
         SET next_sequence = audit_ledger_counters.next_sequence + 1
       RETURNING next_sequence - 1 AS sequence_number`,
      [deploymentId],
    );
    const n = Number(res.rows[0]?.sequence_number);
    if (!Number.isFinite(n) || n < 1) {
      throw new Error('Failed to allocate audit sequence number');
    }
    return n;
  }
}
