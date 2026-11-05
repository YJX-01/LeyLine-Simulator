export type EnergyElement = 'pyro' | 'hydro' | 'cryo' | 'electro' | 'anemo' | 'geo' | 'dendro';
export interface EnergyActor { id: string; element: EnergyElement; capacity: number; initial: number }
export class EnergyPool {
  private values = new Map<string, number>();
  constructor(private actors: readonly EnergyActor[]) {
    for (const actor of actors) this.values.set(actor.id, actor.initial);
  }
  get(actorId: string): number {
    const value = this.values.get(actorId);
    if (value === undefined) throw new Error(`Unknown energy actor: ${actorId}`);
    return value;
  }
  add(actorId: string, amount: number) {
    const actor = this.actors.find(a => a.id === actorId);
    if (!actor) throw new Error(`Unknown energy actor: ${actorId}`);
    const before = this.get(actorId);
    const after = Math.min(actor.capacity, before + amount);
    this.values.set(actorId, after);
    return { actorId, before, after, gained: after - before, overflow: amount - (after - before) };
  }
  spend(actorId: string, amount: number): boolean {
    const value = this.get(actorId);
    if (value < amount) return false;
    this.values.set(actorId, value - amount);
    return true;
  }
  collect(element: EnergyElement | 'clear', kind: 'particle' | 'orb', count: number,
    onField: string, recharge: (actorId: string) => number) {
    return this.actors.map(actor => {
      const color = element === 'clear' ? 2 : element === actor.element ? 3 : 1;
      const field = actor.id === onField ? 1 : 1 - 0.1 * this.actors.length;
      return this.add(actor.id, count * color * (kind === 'orb' ? 3 : 1) * field * recharge(actor.id));
    });
  }
  snapshot(): Record<string, number> { return Object.fromEntries(this.values); }
}
