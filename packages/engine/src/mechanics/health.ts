export class HealthPool {
  private values = new Map<string, { current: number; max: number }>();
  constructor(actors: readonly { id: string; maxHp: number; ratio: number }[]) {
    for (const actor of actors) this.values.set(actor.id, { current: actor.maxHp * actor.ratio, max: actor.maxHp });
  }
  get(id: string) {
    const state = this.values.get(id);
    if (!state) throw new Error(`Unknown health actor: ${id}`);
    return { ...state, ratio: state.current / state.max };
  }
  change(id: string, delta: number, nonlethal = false) {
    if (!Number.isFinite(delta)) throw new Error('Non-finite health change');
    const state = this.values.get(id)!;
    const before = state.current;
    state.current = Math.max(nonlethal ? Math.min(1, state.current) : 0, Math.min(state.max, state.current + delta));
    return { before, after: state.current, actual: state.current - before, max: state.max };
  }
  snapshot() { return Object.fromEntries([...this.values].map(([id, state]) => [id, { ...state }])); }
}
