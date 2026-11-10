import type { Logger } from './logger.js';

export type Job = { name: string; run: () => Promise<void> };

/**
 * In-process background queue with bounded concurrency and retry.
 * Memory enrichment runs here so it never adds latency to an answer.
 * Interface is deliberately tiny so it can be replaced by BullMQ/SQS without touching callers.
 */
export class JobQueue {
  private readonly pending: Array<Job & { attempt: number }> = [];
  private active = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly logger: Logger,
    private readonly concurrency = 2,
    private readonly maxAttempts = 3,
  ) {}

  enqueue(job: Job): void {
    this.pending.push({ ...job, attempt: 1 });
    this.pump();
  }

  /** Resolves when every queued job has finished (tests, graceful shutdown). */
  drain(): Promise<void> {
    if (this.active === 0 && this.pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const job = this.pending.shift()!;
      this.active++;
      job
        .run()
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          if (job.attempt < this.maxAttempts) {
            this.logger.warn('job failed, retrying', { job: job.name, attempt: job.attempt, error: message });
            const delay = 500 * 2 ** job.attempt;
            setTimeout(() => {
              this.pending.push({ ...job, attempt: job.attempt + 1 });
              this.pump();
            }, delay).unref();
          } else {
            this.logger.error('job failed permanently', { job: job.name, error: message });
          }
        })
        .finally(() => {
          this.active--;
          this.pump();
          if (this.active === 0 && this.pending.length === 0) {
            for (const resolve of this.idleWaiters.splice(0)) resolve();
          }
        });
    }
  }
}
