import type { CombatInput, CombatSkill, CombatBuff, CombatHitEvent, CombatEvent } from '@leyline/schema';
import type { CombatPanel } from './mechanics/buff-store';
import type { HealthPool } from './mechanics/health';
import type { EnergyPool } from './mechanics/energy';
export type RuntimeHit = Extract<CombatSkill['effect'], { type: 'hit' }>['hit'];
export type RuntimeSummon = Extract<CombatSkill['effect'], { type: 'summon' }>['summon'];
export interface RuntimeSummonInstance {
  token: number; ownerId: string; skillId: string; definition: RuntimeSummon;
  endsAt: number; nextProcAt: number; panel?: CombatPanel;
}
export interface RuntimeContext {
  readonly timeMs: number; readonly onField: string; readonly input: CombatInput;
  health: HealthPool; energy: EnergyPool;
  random(): number; panel(actorId: string): CombatPanel;
  schedule(timeMs: number, callback: () => void, priority?: number): void;
  log(type: Exclude<CombatEvent['type'], 'hit'>, id: string, actorId: string, details?: Record<string, string | number | boolean>): void;
  heal(id: string, amount: number, sourceId: string): void;
  loseHp(id: string, amount: number, sourceId: string): void;
  restoreEnergy(id: string, amount: number, sourceId: string): void;
  particles(id: string, element: CombatInput['actors'][number]['element'] | 'clear', count: number, delayMs: number): void;
  addBuff(buff: CombatBuff): void;
  addEnemyDebuff(debuff: CombatInput['enemyDebuffs'][number]): void;
  spawn(ownerId: string, skill: CombatSkill, summon: RuntimeSummon, panel?: CombatPanel): void;
  hit(ownerId: string, skillId: string, hit: RuntimeHit, id: string, source?: 'direct' | 'summon', panel?: CombatPanel): void;
  resetCooldown(skillId: string): void;
  reduceCooldown(skillId: string, amountMs: number): void;
  skill(id: string): CombatSkill;
  hasSummon(ownerId: string, slot: string): boolean;
  endSummon(ownerId: string, slot: string): void;
}
/** Internal, typed content hooks. These functions are never accepted from JSON. */
export interface CombatRuntime {
  initialize?(ctx: RuntimeContext): void;
  modifyPanel?(ctx: RuntimeContext, actorId: string, panel: CombatPanel): CombatPanel;
  prepareSkill?(ctx: RuntimeContext, skill: CombatSkill, commandId: string): CombatSkill;
  rejectCast?(ctx: RuntimeContext, skill: CombatSkill): string | undefined;
  onCast?(ctx: RuntimeContext, skill: CombatSkill, commandId: string): boolean | void;
  prepareHit?(ctx: RuntimeContext, actorId: string, skillId: string, hit: RuntimeHit): RuntimeHit;
  onHit?(ctx: RuntimeContext, event: CombatHitEvent, hit: RuntimeHit): void;
  onSwitch?(ctx: RuntimeContext, previous: string, next: string): void;
  onEnergy?(ctx: RuntimeContext, actorId: string, kind: string): void;
  onSummonTrigger?(ctx: RuntimeContext, instance: RuntimeSummonInstance, triggerId: string): boolean | void;
  canTriggerSummon?(ctx: RuntimeContext, instance: RuntimeSummonInstance, event: CombatHitEvent, hit: RuntimeHit): boolean;
  onReaction?(ctx: RuntimeContext, actorId: string, reaction: { reaction: string; element: string }): void;
}
