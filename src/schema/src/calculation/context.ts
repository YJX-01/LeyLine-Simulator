import { z } from 'zod';
import { idSchema, millisecondsSchema } from '../common/values';
import { elements } from '../content/stats';
import { calculationFactSchema } from './binding';
import { calculationEventSchema } from './event';
import { calculationSourceSchema } from './source';
import { calculationValueSchema, calculationValueTypeSchema, definitionRefSchema } from './values';

const facts = z.record(idSchema, calculationFactSchema);
const actorFacts = z.record(idSchema, idSchema.nullable());
const factSubject = z.discriminatedUnion('kind', [z.object({ kind: z.enum(['actor', 'target']), id: idSchema }).strict(), z.object({ kind: z.literal('team') }).strict()]);
const stateFacts = facts.superRefine((values, validation) => {
  for (const [key, fact] of Object.entries(values)) {
    if (fact.value === null) continue;
    if (key === 'hpRatio' && (fact.value.kind !== 'quantity' || fact.value.unit !== 'scalar' || fact.value.value < 0 || fact.value.value > 1)
      || ['onField', 'shielded'].includes(key) && fact.value.kind !== 'boolean') validation.addIssue({ code: 'custom', path: [key], message: '战斗状态类型或范围不匹配。' });
  }
});
export const calculationFactIntervalSchema = z.object({ id: idSchema, subject: factSubject,
  startMs: millisecondsSchema, endMs: millisecondsSchema, facts: stateFacts.refine(values => Object.keys(values).length > 0, '状态区间不得为空。') }).strict()
  .refine(interval => interval.endMs > interval.startMs, '状态区间必须为非空左闭右开区间。');
export const calculationFactOverrideSchema = z.object({ subject: factSubject, facts: stateFacts }).strict();
export const calculationFactFrameSchema = z.object({ id: idSchema, subject: factSubject, eventId: idSchema,
  phase: z.enum(['before', 'after']), facts: stateFacts.refine(values => Object.keys(values).length > 0, '事件状态不得为空。') }).strict();
export const combatActorSchema = z.object({
  id: idSchema, inputs: facts, facts: stateFacts, actorFacts,
  identity: z.object({ element: z.enum(elements), sourceRefs: z.array(idSchema).max(1000) }).strict().optional(),
  ascension: z.number().int().min(0).max(6).nullable(), constellation: z.number().int().min(0).max(6).nullable(), refinement: z.number().int().min(1).max(5).nullable(),
  setCounts: z.record(idSchema, z.number().int().min(0).max(5)), effects: z.array(definitionRefSchema).max(10000),
  talents: z.array(z.object({ id: idSchema, level: z.number().int().min(1).max(30), sourceRefs: z.array(idSchema).max(1000).default([]),
    parameters: z.array(z.object({ id: idSchema, type: calculationValueTypeSchema.nullable(), values: z.array(calculationValueSchema.nullable()).min(1).max(30) }).strict()).max(1000),
  }).strict()).max(1000),
}).strict().refine(actor => !actor.effects.length || actor.ascension !== null && actor.constellation !== null && actor.refinement !== null,
  '启用配装效果需要对应的突破、命座和精炼。');
export const combatContextSchema = z.object({
  actors: z.array(combatActorSchema).max(1000),
  targets: z.array(z.object({ id: idSchema, inputs: facts, facts: stateFacts }).strict()).max(10000),
  team: z.object({ inputs: facts, facts: stateFacts, actorFacts }).strict(),
  events: z.array(calculationEventSchema).max(10000), sources: z.array(calculationSourceSchema).max(20000),
  factIntervals: z.array(calculationFactIntervalSchema).max(10000),
  stateFrames: z.array(calculationFactFrameSchema).max(20000).optional(),
  effectRevisions: z.array(z.object({ instanceId: z.string().min(1).max(2000), disabled: z.boolean(), value: calculationValueSchema.optional() }).strict()).max(10000)
    .refine(revisions => new Set(revisions.map(revision => revision.instanceId)).size === revisions.length, '效果修订身份重复。').optional(),
}).strict().superRefine((context, validation) => {
  const actorIds = new Set(context.actors.map(actor => actor.id)), targetIds = new Set(context.targets.map(target => target.id)), eventIds = new Set(context.events.map(event => event.id));
  for (const [key, size] of [['actors', actorIds.size], ['targets', targetIds.size], ['events', eventIds.size]] as const) {
    if (size !== context[key].length) validation.addIssue({ code: 'custom', path: [key], message: '上下文身份重复。' });
  }
  for (const [index, event] of context.events.entries()) {
    if (event.actorId !== null && !actorIds.has(event.actorId) || event.targetIds?.some(id => !targetIds.has(id)) || event.sourceEventIds.some(id => !eventIds.has(id))) validation.addIssue({ code: 'custom', path: ['events', index], message: '事件引用了不存在的队员、目标或来源事件。' });
  }
  for (const [index, actor] of context.actors.entries()) {
    if (new Set(actor.talents.map(talent => talent.id)).size !== actor.talents.length || actor.talents.some(talent => new Set(talent.parameters.map(parameter => parameter.id)).size !== talent.parameters.length)) validation.addIssue({ code: 'custom', path: ['actors', index, 'talents'], message: '技能或参数身份重复。' });
    if (Object.values(actor.actorFacts).some(id => id !== null && !actorIds.has(id))) validation.addIssue({ code: 'custom', path: ['actors', index, 'actorFacts'], message: '队员事实引用不存在的队员。' });
  }
  if (Object.values(context.team.actorFacts).some(id => id !== null && !actorIds.has(id))) validation.addIssue({ code: 'custom', path: ['team', 'actorFacts'], message: '队伍事实引用不存在的队员。' });
  const intervalIds = new Set<string>(), fields = new Map<string, { start: number; end: number; index: number }[]>();
  const stateFrameIds = new Set<string>(), stateFrameFields = new Set<string>();
  for (const [index, entry] of (context.stateFrames ?? []).entries()) {
    if (stateFrameIds.has(entry.id) || !eventIds.has(entry.eventId) || entry.subject.kind !== 'team' && !(entry.subject.kind === 'actor' ? actorIds : targetIds).has(entry.subject.id)) validation.addIssue({ code: 'custom', path: ['stateFrames', index], message: '事件状态身份或引用不合法。' });
    stateFrameIds.add(entry.id);
    for (const key of Object.keys(entry.facts)) {
      const identity = JSON.stringify([entry.subject, entry.eventId, entry.phase, key]);
      if (stateFrameFields.has(identity)) validation.addIssue({ code: 'custom', path: ['stateFrames', index], message: '同一事件阶段、对象和状态不得重复定义。' });
      stateFrameFields.add(identity);
    }
  }
  const onField: { start: number; end: number; actor: string; index: number }[] = [];
  for (const [index, interval] of context.factIntervals.entries()) {
    if (intervalIds.has(interval.id)) validation.addIssue({ code: 'custom', path: ['factIntervals', index], message: '状态区间身份重复。' });
    intervalIds.add(interval.id);
    const subject = interval.subject;
    if (subject.kind !== 'team' && !(subject.kind === 'actor' ? actorIds : targetIds).has(subject.id)) validation.addIssue({ code: 'custom', path: ['factIntervals', index, 'subject'], message: '状态区间引用已失效。' });
    for (const key of Object.keys(interval.facts)) {
      const identity = JSON.stringify([subject, key]), entries = fields.get(identity) ?? [];
      entries.push({ start: interval.startMs, end: interval.endMs, index }); fields.set(identity, entries);
    }
    if (subject.kind === 'actor' && interval.facts.onField?.value?.kind === 'boolean' && interval.facts.onField.value.value) onField.push({ start: interval.startMs, end: interval.endMs, actor: subject.id, index });
  }
  for (const entries of fields.values()) {
    entries.sort((a, b) => a.start - b.start || a.end - b.end);
    let end = -1;
    for (const entry of entries) {
      if (entry.start < end) validation.addIssue({ code: 'custom', path: ['factIntervals', entry.index], message: '同一对象、同一字段的状态区间不得重叠。' });
      end = Math.max(end, entry.end);
    }
  }
  onField.sort((a, b) => a.start - b.start || a.end - b.end);
  let previous = onField[0];
  for (const entry of onField.slice(1)) {
    if (previous && entry.start < previous.end && entry.actor !== previous.actor) validation.addIssue({ code: 'custom', path: ['factIntervals', entry.index], message: '同一时刻不得有多位队员站场。' });
    if (!previous || entry.end > previous.end) previous = entry;
  }
});
export const combatFrameSchema = z.object({
  ownerId: idSchema, recipientId: idSchema, contributorId: idSchema.nullable(), targetId: idSchema, eventId: idSchema,
  sourceEventId: idSchema.nullable(), phase: z.enum(['before', 'after']),
  facts, actorFacts,
  hit: z.object({ skillId: idSchema.nullable(), hitId: idSchema.nullable(), element: z.enum(elements), category: z.enum(['normal', 'charged', 'plunge', 'skill', 'burst']).nullable(),
    family: idSchema, origin: z.enum(['talent', 'reaction', 'triggered']), reactionId: idSchema.nullable() }).strict().superRefine((hit, validation) => {
    if (hit.origin === 'talent' && (hit.skillId === null || hit.hitId === null || hit.category === null)) validation.addIssue({ code: 'custom', message: '技能命中必须关联技能、稳定命中身份和类别。' });
    if (hit.origin === 'reaction' && (hit.reactionId === null || hit.category !== null)) validation.addIssue({ code: 'custom', message: '独立反应须有反应身份，且不继承普通攻击类别。' });
  }).nullable(),
  captures: z.record(idSchema, z.object({ eventId: idSchema, phase: z.enum(['before', 'after']) }).strict().nullable()),
  applications: z.array(z.object({ instanceId: z.string().min(1).max(2000), active: z.boolean().nullable() }).strict()).max(10000),
  factOverrides: z.array(calculationFactOverrideSchema).max(10000),
}).strict().superRefine((frame, validation) => {
  if (new Set(frame.applications.map(application => application.instanceId)).size !== frame.applications.length) validation.addIssue({ code: 'custom', path: ['applications'], message: '适用事实实例不得重复。' });
  const fields = new Set<string>();
  for (const [index, override] of frame.factOverrides.entries()) for (const key of Object.keys(override.facts)) {
    const identity = JSON.stringify([override.subject, key]);
    if (fields.has(identity)) validation.addIssue({ code: 'custom', path: ['factOverrides', index], message: '同一对象、同一字段不得重复覆盖。' });
    fields.add(identity);
  }
});
export type CombatContext = z.infer<typeof combatContextSchema>;
export type CombatActor = z.infer<typeof combatActorSchema>;
export type CombatFrame = z.infer<typeof combatFrameSchema>;
export type CalculationFactFrame = z.infer<typeof calculationFactFrameSchema>;
