/**
 * Lightweight in-process counters for checkpoint / anchor lifecycle health.
 * Not a governance signal — operational visibility only.
 */
export type AuditLifecycleMetricsSnapshot = {
  checkpoints_created_total: number;
  checkpoints_failed_total: number;
  checkpoints_skipped_empty_total: number;
  anchors_pending: number;
  anchors_anchored_total: number;
  anchors_retrying: number;
  anchors_failed: number;
  oldest_unanchored_checkpoint_age_seconds: number | null;
};

export class AuditLifecycleMetrics {
  checkpoints_created_total = 0;
  checkpoints_failed_total = 0;
  checkpoints_skipped_empty_total = 0;
  anchors_anchored_total = 0;

  /** Live counts refreshed by callers (not monotonically incremented). */
  anchors_pending = 0;
  anchors_retrying = 0;
  anchors_failed = 0;
  oldest_unanchored_checkpoint_age_seconds: number | null = null;

  recordCheckpointCreated(): void {
    this.checkpoints_created_total += 1;
  }

  recordCheckpointFailed(): void {
    this.checkpoints_failed_total += 1;
  }

  recordCheckpointSkippedEmpty(): void {
    this.checkpoints_skipped_empty_total += 1;
  }

  recordAnchorAnchored(): void {
    this.anchors_anchored_total += 1;
  }

  setAnchorHealth(input: {
    pending: number;
    retrying: number;
    failed: number;
    oldestUnanchoredAgeSeconds: number | null;
  }): void {
    this.anchors_pending = input.pending;
    this.anchors_retrying = input.retrying;
    this.anchors_failed = input.failed;
    this.oldest_unanchored_checkpoint_age_seconds =
      input.oldestUnanchoredAgeSeconds;
  }

  snapshot(): AuditLifecycleMetricsSnapshot {
    return {
      checkpoints_created_total: this.checkpoints_created_total,
      checkpoints_failed_total: this.checkpoints_failed_total,
      checkpoints_skipped_empty_total: this.checkpoints_skipped_empty_total,
      anchors_pending: this.anchors_pending,
      anchors_anchored_total: this.anchors_anchored_total,
      anchors_retrying: this.anchors_retrying,
      anchors_failed: this.anchors_failed,
      oldest_unanchored_checkpoint_age_seconds:
        this.oldest_unanchored_checkpoint_age_seconds,
    };
  }
}

/** Shared process metrics (appliance / tests may replace). */
export const auditLifecycleMetrics = new AuditLifecycleMetrics();
