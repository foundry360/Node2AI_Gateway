import type { IntegrityAuditService } from './integrity-service.js';
import type { EvidenceAnchoringService } from './anchoring-service.js';
import { auditLifecycleMetrics } from './lifecycle-metrics.js';

/**
 * Background worker for checkpoint scheduling + durable anchor jobs.
 * Never participates in the AI / PDP request path.
 */
export class EvidenceLifecycleWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly audit: IntegrityAuditService | null,
    private readonly anchoring: EvidenceAnchoringService | null,
    private readonly intervalMs = 5_000,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
    void this.tick();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<{ checkpoints: number; anchors: number }> {
    if (this.running) return { checkpoints: 0, anchors: 0 };
    this.running = true;
    let checkpoints = 0;
    let anchors = 0;
    try {
      if (this.audit && typeof this.audit.runScheduledCheckpoints === 'function') {
        checkpoints = await this.audit.runScheduledCheckpoints();
      }
      if (this.anchoring) {
        for (let i = 0; i < 10; i++) {
          const did = await this.anchoring.processNextJob();
          if (!did) break;
          anchors += 1;
        }
        await this.refreshAnchorMetrics();
      }
    } catch {
      /* never throw into timer */
    } finally {
      this.running = false;
    }
    return { checkpoints, anchors };
  }

  private async refreshAnchorMetrics(): Promise<void> {
    if (!this.anchoring || !this.audit) return;
    try {
      const deploymentId = await this.audit.resolveDeploymentIdPublic?.();
      if (!deploymentId) return;
      const jobs = await this.anchoring.listJobs(deploymentId);
      const pending = jobs.filter((j) => j.status === 'PENDING').length;
      const retrying = jobs.filter(
        (j) => j.status === 'RETRY' || j.status === 'IN_PROGRESS',
      ).length;
      const failed = jobs.filter((j) => j.status === 'FAILED').length;
      const checkpoints = await this.audit.listCheckpoints(deploymentId);
      const anchored = new Set(
        (await this.anchoring.list(deploymentId))
          .filter(
            (a) =>
              a.anchor_status === 'ANCHORED' || a.anchor_status === 'VERIFIED',
          )
          .map((a) => a.checkpoint_id),
      );
      let oldestAge: number | null = null;
      const now = Date.now();
      for (const cp of checkpoints) {
        if (anchored.has(cp.checkpoint_id)) continue;
        const age = Math.floor(
          (now - new Date(cp.created_at).getTime()) / 1000,
        );
        if (oldestAge === null || age > oldestAge) oldestAge = age;
      }
      auditLifecycleMetrics.setAnchorHealth({
        pending,
        retrying,
        failed,
        oldestUnanchoredAgeSeconds: oldestAge,
      });
    } catch {
      /* ignore metrics refresh errors */
    }
  }
}

/** @deprecated Prefer EvidenceLifecycleWorker — retained for imports. */
export { EvidenceLifecycleWorker as AnchorWorker };
