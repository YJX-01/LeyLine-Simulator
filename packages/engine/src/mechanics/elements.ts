export type AuraElement = 'pyro' | 'hydro' | 'cryo';
export type HitElement = AuraElement | 'physical';
export type Reaction = 'vaporize' | 'reverse-vaporize' | 'melt' | 'reverse-melt';
export interface Aura { element: AuraElement; units: number; decayPerMs: number }
const durations = { 1: 9500, 2: 12000, 4: 17000 } as const;
const reactions: Record<string, { reaction: Reaction; base: number; consumption: number }> = {
  'pyro:hydro': { reaction: 'vaporize', base: 2, consumption: 2 },
  'hydro:pyro': { reaction: 'reverse-vaporize', base: 1.5, consumption: 0.5 },
  'cryo:pyro': { reaction: 'melt', base: 2, consumption: 2 },
  'pyro:cryo': { reaction: 'reverse-melt', base: 1.5, consumption: 0.5 },
};
export class ElementalGauge {
  private aura: Aura | null = null;
  private clock = 0;
  advance(timeMs: number): Aura | null {
    if (timeMs < this.clock) throw new RangeError('Aura cannot move backwards in time');
    if (this.aura) {
      this.aura.units -= (timeMs - this.clock) * this.aura.decayPerMs;
      if (this.aura.units <= 1e-9) this.aura = null;
    }
    this.clock = timeMs;
    return this.aura ? { ...this.aura } : null;
  }
  apply(element: AuraElement, gauge: 1 | 2 | 4, timeMs: number): { reaction?: Reaction; baseMultiplier: number; aura: Aura | null } {
    this.advance(timeMs);
    const units = gauge * 0.8;
    const decayPerMs = units / durations[gauge];
    if (!this.aura) {
      this.aura = { element, units, decayPerMs };
    } else if (this.aura.element === element) {
      const changed = units > this.aura.units;
      this.aura.units = Math.max(this.aura.units, units);
      if (element === 'pyro' && changed) this.aura.decayPerMs = decayPerMs;
    } else {
      const rule = reactions[`${this.aura.element}:${element}`];
      if (!rule) throw new Error(`Unsupported reaction: ${this.aura.element} + ${element}`);
      this.aura.units -= rule.consumption * gauge;
      if (this.aura.units <= 1e-9) this.aura = null;
      return { reaction: rule.reaction, baseMultiplier: rule.base, aura: this.aura ? { ...this.aura } : null };
    }
    return { baseMultiplier: 1, aura: this.aura ? { ...this.aura } : null };
  }
}

export function amplification(base: number, elementalMastery: number, reactionBonus: number): number {
  return base === 1 ? 1 : base * (1 + 2.78 * elementalMastery / (1400 + elementalMastery) + reactionBonus);
}
