type Task<T> = () => Promise<T>;

interface QueueEntry<T> {
  task: Task<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  priority: number; // lower = higher priority
}

/**
 * Simple token-bucket rate limiter with priority queue.
 * Default: 40 requests/minute (below GitGuardian free tier limit of 50).
 */
export class RequestQueue {
  private queue: QueueEntry<unknown>[] = [];
  private tokens: number;
  private readonly maxTokens: number;
  private running = false;
  private refillTimer: ReturnType<typeof setInterval> | null = null;

  constructor(requestsPerMinute = 40) {
    this.maxTokens = requestsPerMinute;
    this.tokens = requestsPerMinute;
  }

  enqueue<T>(task: Task<T>, priority = 5): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ task: task as Task<unknown>, resolve: resolve as (v: unknown) => void, reject, priority });
      this.queue.sort((a, b) => a.priority - b.priority);
      this.ensureRefill();
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0 && this.tokens > 0) {
      const entry = this.queue.shift()!;
      this.tokens--;
      try {
        const result = await entry.task();
        entry.resolve(result);
      } catch (err) {
        entry.reject(err);
      }
    }
    this.running = false;
  }

  private ensureRefill(): void {
    if (this.refillTimer) return;
    this.refillTimer = setInterval(() => {
      this.tokens = Math.min(this.maxTokens, this.tokens + Math.ceil(this.maxTokens / 6)); // refill every 10s
      if (this.queue.length > 0) this.drain();
    }, 10_000);
  }

  destroy(): void {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }
}
