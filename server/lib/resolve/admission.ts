/** Image work is admitted before buffering the body: no unbounded blob queue. */
export class RecognitionBudgetError extends Error {
  readonly status = 429;
  constructor() {
    super('Image recognition capacity or daily budget has been reached.');
  }
}

export class RecognitionBudget {
  private active = new Set<number>();
  private day = '';
  private total = 0;
  private counts = new Map<number, number>();

  constructor(
    private readonly concurrency = 2,
    private readonly perUserDaily = 50,
    private readonly totalDaily = 500
  ) {}

  acquire(userId: number, now = new Date()): () => void {
    const day = now.toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.total = 0;
      this.counts.clear();
    }
    const count = this.counts.get(userId) ?? 0;
    if (
      this.active.has(userId) ||
      this.active.size >= this.concurrency ||
      count >= this.perUserDaily ||
      this.total >= this.totalDaily
    )
      throw new RecognitionBudgetError();
    this.active.add(userId);
    this.counts.set(userId, count + 1);
    this.total++;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active.delete(userId);
      }
    };
  }
}

export const recognitionBudget = new RecognitionBudget();
