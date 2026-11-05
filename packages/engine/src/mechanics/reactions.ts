import type { CombatAura, CombatReaction } from '@leyline/schema';
export type AppliedElement = 'pyro' | 'hydro' | 'cryo' | 'electro';
export interface ReactionDescriptor { reaction: CombatReaction; element: string; coefficient: number }
const life = { 1: 9500, 2: 12000, 4: 17000 };
export class ReactionGauge {
  private auras = new Map<AppliedElement, CombatAura>();
  private frozen: { units: number; rate: number } | null = null;
  private clock = 0;
  advance(time: number): CombatAura | null {
    if (time < this.clock) throw new Error('Gauge cannot move backwards');
    const delta = time - this.clock;
    for (const [element, aura] of this.auras) {
      aura.units -= delta * aura.decayPerMs;
      if (aura.units < 1e-9) this.auras.delete(element);
    }
    if (this.frozen) {
      const seconds = delta / 1000;
      this.frozen.units -= this.frozen.rate * seconds + 0.05 * seconds * seconds;
      this.frozen.rate += 0.1 * seconds;
      if (this.frozen.units <= 1e-9) this.frozen = null;
    }
    this.clock = time;
    return this.snapshot()[0] ?? null;
  }
  snapshot(): CombatAura[] {
    return [...(this.frozen ? [{ element: 'frozen' as const, units: this.frozen.units, decayPerMs: this.frozen.rate / 1000 }] : []),
      ...[...this.auras.values()].map(aura => ({ ...aura }))];
  }
  hasEC() { return this.auras.has('hydro') && this.auras.has('electro'); }
  ecRemainingMs(): number {
    return this.hasEC() ? Math.min(...(['hydro', 'electro'] as const).map(element => {
      const aura = this.auras.get(element)!; return aura.units / aura.decayPerMs;
    })) : 0;
  }
  consumeEC() { this.consume('hydro', 0.4); this.consume('electro', 0.4); }
  private consume(element: AppliedElement, amount: number) {
    const aura = this.auras.get(element);
    if (!aura) return;
    aura.units -= amount;
    if (aura.units <= 1e-9) this.auras.delete(element);
  }
  private add(element: AppliedElement, gauge: 1 | 2 | 4) {
    const current = this.auras.get(element);
    const units = 0.8 * gauge;
    if (current) {
      if (units > current.units && element === 'pyro') current.decayPerMs = units / life[gauge];
      current.units = Math.max(current.units, units);
    } else this.auras.set(element, { element, units, decayPerMs: units / life[gauge] });
  }
  apply(element: string, gauge: 1 | 2 | 4, time: number, blunt = false) {
    this.advance(time);
    const reactions: ReactionDescriptor[] = [];
    let baseMultiplier = 1;
    if (this.frozen && (blunt || element === 'geo')) {
      this.frozen = null; reactions.push({ reaction: 'shattered', element: 'physical', coefficient: 3 });
    }
    if (element === 'physical') return { reactions, baseMultiplier, aura: this.advance(time) };
    if (element === 'anemo' || element === 'geo') {
      if (this.frozen) {
        this.frozen.units -= gauge * 0.5;
        reactions.push({ reaction: 'swirl', element: 'cryo', coefficient: 0.6 });
        if (this.frozen.units <= 0) this.frozen = null;
      }
      for (const aura of [...this.auras.values()]) {
        if (aura.element === 'frozen') continue;
        this.consume(aura.element, gauge * 0.5);
        reactions.push({ reaction: element === 'anemo' ? 'swirl' : 'crystallize', element: aura.element, coefficient: element === 'anemo' ? 0.6 : 0 });
      }
      return { reactions, baseMultiplier, aura: this.advance(time) };
    }
    if (!['pyro', 'hydro', 'cryo', 'electro'].includes(element)) throw new Error(`Unsupported element: ${element}`);
    const trigger = element as AppliedElement;
    if (this.frozen && trigger === 'pyro') {
      this.frozen.units -= gauge * 2;
      if (this.frozen.units <= 0) this.frozen = null;
      this.consume('cryo', gauge * 2);
      reactions.push({ reaction: 'melt', element: 'pyro', coefficient: 0 });
      return { reactions, baseMultiplier: 2, aura: this.advance(time) };
    }
    const other = [...this.auras.keys()].filter(key => key !== trigger);
    if (!other.length) this.add(trigger, gauge);
    else for (const aura of other) {
      const pair = `${aura}:${trigger}`;
      if (pair === 'pyro:hydro' || pair === 'cryo:pyro' || pair === 'hydro:pyro' || pair === 'pyro:cryo') {
        const strong = pair === 'pyro:hydro' || pair === 'cryo:pyro';
        this.consume(aura, gauge * (strong ? 2 : 0.5));
        const reaction = pair === 'pyro:hydro' ? 'vaporize' : pair === 'hydro:pyro' ? 'reverse-vaporize' : pair === 'cryo:pyro' ? 'melt' : 'reverse-melt';
        reactions.push({ reaction, element: trigger, coefficient: 0 }); baseMultiplier = strong ? 2 : 1.5;
      } else if (pair === 'hydro:electro' || pair === 'electro:hydro') {
        this.add(trigger, gauge);
        reactions.push({ reaction: 'electro-charged', element: 'electro', coefficient: 2 });
      } else if (pair === 'cryo:hydro' || pair === 'hydro:cryo') {
        const consumed = Math.min(this.auras.get(aura)!.units, gauge);
        this.consume(aura, consumed);
        this.frozen = { units: Math.max(this.frozen?.units ?? 0, consumed * 2), rate: 0.4 };
        reactions.push({ reaction: 'frozen', element: 'cryo', coefficient: 0 });
      } else if ([aura, trigger].includes('electro') && [aura, trigger].includes('pyro')) {
        this.consume(aura, gauge); reactions.push({ reaction: 'overloaded', element: 'pyro', coefficient: 2.75 });
      } else if ([aura, trigger].includes('electro') && [aura, trigger].includes('cryo')) {
        this.consume(aura, gauge); reactions.push({ reaction: 'superconduct', element: 'cryo', coefficient: 1.5 });
      } else throw new Error(`Unsupported reaction: ${pair}`);
    }
    return { reactions, baseMultiplier, aura: this.advance(time) };
  }
}
