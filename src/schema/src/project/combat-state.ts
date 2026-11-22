import { actorConditions, type HitFacts } from './hit-facts';
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
  timeline: { actor: string; timeMs: number; kind: string; order?: number; id?: string; fieldSwitch?: object; damage?: {
    facts?: HitFacts;
  } }[];
}

/** Read switches in event order and bounded observations on their half-open intervals. */
export function createFieldPresenceReader(project: Pick<StateProject,'combatStates'|'timeline'>) {
  const marked = (project.combatStates ?? []).filter(s => s.values.onField !== undefined).sort((a,b) => a.startMs-b.startMs);
  const on = marked.filter(s => s.values.onField === true);
  const byActor = new Map<string, CombatStateInterval[]>();
  for (const s of marked) {
    const list = byActor.get(s.actor) ?? [];
    list.push(s);
    byActor.set(s.actor,list);
  }
  const switches = project.timeline.filter(r => r.fieldSwitch).sort((a,b) => a.timeMs-b.timeMs || (a.order ?? 0)-(b.order ?? 0));
  function last<T>(values: readonly T[], eligible: (value: T) => boolean) {
    let left=0, right=values.length;
    while (left<right) { const mid=(left+right)>>>1; if (eligible(values[mid])) left=mid+1; else right=mid; }
    return values[left-1] as T | undefined;
  }
  function bound(list: CombatStateInterval[], time: number) {
    const current = last(list,s => s.startMs<=time);
    return current && time<current.endMs ? current : undefined;
  }
  return (actor: string, time: number, order = Infinity, after = false) => {
    const marked = bound(byActor.get(actor) ?? [],time) ?? bound(on,time);
    const swap = last(switches,r => r.timeMs < time || r.timeMs === time && ((r.order ?? 0) < order || after && r.order === order));
    if (swap && (!marked || swap.timeMs >= marked.startMs)) return { value: swap.actor===actor, source:'switch' as const, id:swap.id! };
    if (marked) return { value: marked.actor===actor ? marked.values.onField ?? null : false, source:'interval' as const, id:marked.id };
  };
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
  const presence = createFieldPresenceReader(project);
  project.timeline.forEach((record, index) => {
    const values = new Map<string, CombatConditions>();
    for (const [rowIndex, row] of (record.damage?.facts ?? []).entries()) {
      if (row.subject.kind === 'actor') {
        if (!actors.has(row.subject.id)) issue(['timeline', index, 'damage', 'facts', rowIndex], '命中覆盖引用的队员不存在。');
        values.set(row.subject.id, actorConditions(record.damage?.facts, row.subject.id));
      }
      if (row.subject.kind === 'target' && row.subject.id !== 'target') issue(['timeline', index, 'damage', 'facts', rowIndex], '命中目标不存在。');
    }
    if (invalid || record.kind !== 'damage') return;
    const active = [...actors].filter(actor => {
      const override = values.get(actor)?.onField;
      return (override !== undefined ? override : presence(actor, record.timeMs, record.order)?.value) === true;
    });
    if (active.length > 1) issue(['timeline', index, 'damage'], '命中覆盖与区间合并后不能有多位队员站场。');
  });
}
