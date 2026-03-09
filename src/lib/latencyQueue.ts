/**
 * 仮想レイテンシキュー
 * DBからのデータフェッチは即座に行うが、UIへの反映を意図的に遅延させる
 */

export interface QueuedItem<T> {
  data: T;
  deliverAt: number;
}

export class LatencyQueue<T> {
  private queue: QueuedItem<T>[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private onDeliver: (item: T) => void;
  private minDelay: number;
  private maxDelay: number;

  constructor(
    onDeliver: (item: T) => void,
    minDelayMs: number = 2000,
    maxDelayMs: number = 5000
  ) {
    this.onDeliver = onDeliver;
    this.minDelay = minDelayMs;
    this.maxDelay = maxDelayMs;
  }

  enqueue(item: T): void {
    const delay =
      this.minDelay + Math.random() * (this.maxDelay - this.minDelay);
    this.queue.push({
      data: item,
      deliverAt: Date.now() + delay,
    });
    this.startProcessing();
  }

  private startProcessing(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      const ready = this.queue.filter((q) => q.deliverAt <= now);
      this.queue = this.queue.filter((q) => q.deliverAt > now);

      for (const item of ready) {
        this.onDeliver(item.data);
      }

      if (this.queue.length === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 500);
  }

  destroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.queue = [];
  }
}
