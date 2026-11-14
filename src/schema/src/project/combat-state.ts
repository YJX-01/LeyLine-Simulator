import { z } from 'zod';
import { idSchema, millisecondsSchema } from '../common/values';
import { combatConditionsSchema, type CombatConditions } from './combat-conditions';

export const combatStateFields = ['hpRatio', 'onField', 'shielded'] as const;
export type CombatStateField = typeof combatStateFields[number];
const stateValuesSchema = combatConditionsSchema.refine(
  values => combatStateFields.some(field => values[field] !== undefined),
  '状态标注必须至少提供一个字段；未知请显式填写null。',
);

export const combatStateIntervalSchema = z.object({
  id: idSchema,
  actor: idSchema,
  startMs: millisecondsSchema,
  endMs: millisecondsSchema,
  values: stateValuesSchema,
}).strict().refine(interval => interval.endMs > interval.startMs, '状态区间必须为非空左闭右开区间。');

export const combatStateOverrideSchema = z.object({
  actor: idSchema,
  values: stateValuesSchema,
}).strict();

export type CombatStateInterval = z.infer<typeof combatStateIntervalSchema>;
export type CombatStateOverride = z.infer<typeof combatStateOverrideSchema>;

interface StateProject {
  candidate: { actors: { id: string }[] };
  combatStates?: CombatStateInterval[];
  timeline: { actor: string; timeMs: number; kind: string; damage?: {
    conditions?: CombatConditions;
    stateOverrides?: CombatStateOverride[];
  } }[];
}

/** Validate annotations without deriving HP changes, shield survival or combat events. */
export function validateCombatStates(project: StateProject, context: z.RefinementCtx): void {
  const actors = new Set(project.candidate.actors.map(actor => actor.id));
  const ids = new Set<string>();
  const fields = new Map<string, { interval: CombatStateInterval; index: number }[]>();
  let invalid = false;
  const issue = (path: (string | number)[], message: string) => {
    invalid = true;
    context.addIssue({ code: 'custom', path, message });
  };
  (project.combatStates ?? []).forEach((interval, index) => {
    if (ids.has(interval.id)) issue(['combatStates', index, 'id'], '状态区间标识重复。');
    ids.add(interval.id);
    if (!actors.has(interval.actor)) issue(['combatStates', index, 'actor'], '状态标注引用的队员不存在。');
    for (const field of combatStateFields) {
      if (interval.values[field] === undefined) continue;
      const key = JSON.stringify([interval.actor, field]);
      const entries = fields.get(key) ?? [];
      entries.push({ interval, index });
      fields.set(key, entries);
    }
  });
  for (const entries of fields.values()) {
    entries.sort((a, b) => a.interval.startMs - b.interval.startMs || a.interval.endMs - b.interval.endMs);
    let previous = entries[0];
    for (const entry of entries.slice(1)) {
      if (entry.interval.startMs < previous.interval.endMs) issue(['combatStates', entry.index, 'values'], '同一队员、同一字段的状态区间不能重叠。');
      if (entry.interval.endMs > previous.interval.endMs) previous = entry;
    }
  }
  const onField = (project.combatStates ?? []).map((interval, index) => ({ interval, index }))
    .filter(entry => entry.interval.values.onField === true)
    .sort((a, b) => a.interval.startMs - b.interval.startMs);
  let previous = onField[0];
  for (const entry of onField.slice(1)) {
    if (entry.interval.startMs < previous.interval.endMs && entry.interval.actor !== previous.interval.actor) {
      issue(['combatStates', entry.index, 'values', 'onField'], '同一时刻不能标注多位队员站场。');
    }
    if (entry.interval.endMs > previous.interval.endMs) previous = entry;
  }
  const intervalValue = (actor: string, timeMs: number): boolean | null | undefined => {
    const entries = fields.get(JSON.stringify([actor, 'onField'])) ?? [];
    let left = 0;
    let right = entries.length;
    while (left < right) {
      const middle = (left + right) >>> 1;
      if (entries[middle].interval.startMs <= timeMs) left = middle + 1;
      else right = middle;
    }
    const interval = entries[left - 1]?.interval;
    return interval && timeMs < interval.endMs ? interval.values.onField : undefined;
  };
  project.timeline.forEach((record, index) => {
    const overrides = record.damage?.stateOverrides ?? [];
    if (record.kind !== 'damage' && record.damage) issue(['timeline', index, 'damage'], '非伤害记录不能携带命中条件或命中覆盖。');
    const values = new Map<string, CombatConditions>();
    if (record.damage?.conditions) values.set(record.actor, record.damage.conditions);
    overrides.forEach((override, overrideIndex) => {
      const path = ['timeline', index, 'damage', 'stateOverrides', overrideIndex];
      if (!actors.has(override.actor)) issue([...path, 'actor'], '命中覆盖引用的队员不存在。');
      const existing = values.get(override.actor) ?? {};
      for (const field of combatStateFields) {
        if (existing[field] !== undefined && override.values[field] !== undefined) issue([...path, 'values', field], '同一命中不能重复覆盖同一队员的同一状态字段。');
      }
      values.set(override.actor, { ...existing, ...override.values });
    });
    if (invalid || record.kind !== 'damage') return;
    const active = [...actors].filter(actor => {
      const override = values.get(actor)?.onField;
      return (override !== undefined ? override : intervalValue(actor, record.timeMs)) === true;
    });
    if (active.length > 1) issue(['timeline', index, 'damage'], '命中覆盖与区间合并后不能有多位队员站场。');
  });
}
