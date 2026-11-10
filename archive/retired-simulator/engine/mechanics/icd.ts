export class ApplicationCooldown {
  private groups = new Map<string, { resetAt: number; hit: number }>();
  allows(actorId: string, tag: string, timeMs: number, rule: 'none' | 'standard'): boolean {
    if (rule === 'none') return true;
    const key = JSON.stringify([actorId, tag]);
    const state = this.groups.get(key);
    if (!state || timeMs >= state.resetAt) {
      this.groups.set(key, { resetAt: timeMs + 2500, hit: 0 });
      return true;
    }
    state.hit++;
    // Count-triggered application never resets the timer.
    return state.hit % 3 === 0;
  }
}
