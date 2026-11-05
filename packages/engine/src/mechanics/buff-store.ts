import type { CombatBuff, CombatStats } from '@leyline/schema';
export interface CombatPanel {
  attack: number; damageBonus: number; critRate: number; critDamage: number;
  elementalMastery: number; reactionBonus: number; energyRecharge: number; buffIds: string[];
}
export class BuffStore {
  private active = new Map<string, Map<string, CombatBuff>>();
  start(actorId: string, buff: CombatBuff): CombatBuff | undefined {
    let target = this.active.get(actorId);
    if (!target) this.active.set(actorId, target = new Map());
    const key = buff.stacking === 'add' ? `id:${buff.id}` : `group:${buff.group}`;
    const replaced = target.get(key);
    target.set(key, buff);
    return replaced;
  }
  end(actorId: string, buff: CombatBuff): boolean {
    const target = this.active.get(actorId);
    const key = buff.stacking === 'add' ? `id:${buff.id}` : `group:${buff.group}`;
    if (target?.get(key) !== buff) return false;
    target.delete(key);
    return true;
  }
  panel(actorId: string, stats: CombatStats): CombatPanel {
    const values = { ...stats };
    const buffIds: string[] = [];
    for (const buff of this.active.get(actorId)?.values() ?? []) {
      const { directDamageBonus: _direct, ...modifiers } = buff.modifiers;
      if (Object.keys(modifiers).length) buffIds.push(buff.id);
      for (const key of Object.keys(modifiers) as (keyof typeof modifiers)[]) values[key] += modifiers[key] ?? 0;
    }
    // Buff totals may exceed the per-input bounds; arithmetic here uses validated individual values.
    return {
      attack: (values.characterBaseAttack + values.weaponBaseAttack) * (1 + values.attackPercent) + values.flatAttack,
      damageBonus: values.damageBonus, critRate: Math.min(1, values.critRate), critDamage: values.critDamage,
      elementalMastery: values.elementalMastery, reactionBonus: values.reactionBonus,
      energyRecharge: values.energyRecharge, buffIds,
    };
  }
  directBonus(actorId: string): number {
    let total = 0;
    for (const buff of this.active.get(actorId)?.values() ?? []) total += buff.modifiers.directDamageBonus ?? 0;
    return total;
  }
  directIds(actorId: string): string[] {
    return [...(this.active.get(actorId)?.values() ?? [])].filter(buff => (buff.modifiers.directDamageBonus ?? 0) !== 0).map(buff => buff.id);
  }
}
