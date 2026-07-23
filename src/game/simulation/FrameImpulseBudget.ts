export class FrameImpulseBudget {
  private remaining: number;

  constructor(readonly limit: number) {
    this.remaining = Math.max(0, limit);
  }

  take(requested: number): number {
    const granted = Math.min(Math.max(0, requested), this.remaining);
    this.remaining -= granted;
    return granted;
  }

  get available(): number {
    return this.remaining;
  }
}
