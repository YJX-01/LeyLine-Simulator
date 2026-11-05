interface ScheduledEvent {
  timeMs: number;
  priority: number;
  sequence: number;
  execute: () => void;
}

/** Lower priority runs first; insertion order breaks ties. One scheduler per simulation. */
export class EventScheduler {
  private heap: ScheduledEvent[] = [];
  private sequence = 0;
  private clock = 0;
  private running = false;
  get timeMs() { return this.clock; }
  get pending() { return this.heap.length; }

  schedule(timeMs: number, execute: () => void, priority = 0): void {
    if (!Number.isSafeInteger(timeMs) || timeMs < this.clock) {
      throw new RangeError('Event time must be an integer millisecond at or after the current clock');
    }
    if (!Number.isSafeInteger(priority)) throw new RangeError('Priority must be a safe integer');
    if (!Number.isSafeInteger(this.sequence + 1)) throw new RangeError('Event sequence exhausted');
    const event = { timeMs, priority, sequence: this.sequence++, execute };
    this.heap.push(event);
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (!this.before(event, this.heap[parent])) break;
      this.heap[index] = this.heap[parent];
      index = parent;
    }
    this.heap[index] = event;
  }

  /** Inclusive end time. A budget prevents an infinite chain of same-time events. */
  runUntil(endTimeMs: number, maxEvents = 100_000): number {
    if (this.running) throw new Error('Scheduler cannot run recursively');
    if (!Number.isSafeInteger(endTimeMs) || endTimeMs < this.clock) throw new RangeError('Invalid end time');
    if (!Number.isSafeInteger(maxEvents) || maxEvents < 1) throw new RangeError('Invalid event budget');
    let processed = 0;
    this.running = true;
    try {
      while (this.heap.length && this.heap[0].timeMs <= endTimeMs) {
        if (processed === maxEvents) throw new Error('Event budget exceeded');
        const event = this.pop();
        this.clock = event.timeMs;
        processed++;
        event.execute();
      }
      this.clock = endTimeMs;
      return processed;
    } finally { this.running = false; }
  }

  private before(a: ScheduledEvent, b: ScheduledEvent): boolean {
    return a.timeMs < b.timeMs || (a.timeMs === b.timeMs &&
      (a.priority < b.priority || (a.priority === b.priority && a.sequence < b.sequence)));
  }

  private pop(): ScheduledEvent {
    const first = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length) {
      let index = 0;
      while (index * 2 + 1 < this.heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.heap.length && this.before(this.heap[child + 1], this.heap[child])) child++;
        if (!this.before(this.heap[child], last)) break;
        this.heap[index] = this.heap[child];
        index = child;
      }
      this.heap[index] = last;
    }
    return first;
  }
}
