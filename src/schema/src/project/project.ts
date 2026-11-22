import { findCharacterHit, findBuildHit, hitEventFactIssues } from '../content/hit-ref';
import { APP_VERSION } from '../version.mjs';
import { z } from 'zod';
import { idSchema,millisecondsSchema,quantitySchema } from '../common/values';
import { buildSchema } from '../account/build';
import { sceneSelectionsSchema } from './scenes';
import { damageRequestSchema } from './damage';
import { enemySchema } from './enemy';
import { hitFactsSchema, subjectFacts } from './hit-facts';
import { combatFactDeclaration } from '../calculation/buffs.mjs';
import { talentInputIssues } from '../content/talent';
import { elements } from '../content/stats';
import { ruleDefinitionSchema } from './expressions';
import { combatStateIntervalSchema, validateCombatStates } from './combat-state';
import { calculationBundleSchema } from '../calculation/bundle';
import { calculationFactSchema } from '../calculation/binding';
import { stateMachineRequestSchema } from '../calculation/state-machine';
import { characterActionsDefinitionSchema } from '../content/actions';
import { definitionKey, definitionRefSchema, valueMatchesType } from '../calculation/values';
import { auraObservationSchema, confirmedBuffSchema, validateCombatObservations } from '../calculation/event';
import { projectReactionSchema } from './reaction-event';
const projectFields = z.object({
  seed: z.number().int().min(0).max(4294967295).optional(),
  schemaVersion: z.literal(APP_VERSION), rulesVersion: z.literal('timeline-v1'), calculationProfile: z.enum(['direct', 'dependency']).optional(), id: idSchema, name: idSchema.optional(), revision: idSchema,
  definitions: z.array(ruleDefinitionSchema).max(200),
  candidate: z.object({
    id: idSchema, actors: z.array(z.object({ id: idSchema, name: idSchema.optional(), character: idSchema, weapon: idSchema, element: z.enum(elements).optional(), inputs: z.record(idSchema, quantitySchema), build: buildSchema.optional(),
      accountSnapshot: z.object({ accountId: idSchema, characterId: idSchema, weapon: z.string().max(160),
        artifacts: z.array(z.object({ id: idSchema, name: idSchema, slot: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']), attack: z.number().finite().nonnegative() }).strict()).max(5),
      }).strict().optional(),
    }).strict()).max(100),
  }).strict(),
  effectRevisions: z.array(z.object({ instanceId: z.string().min(1).max(2000), disabled: z.boolean(), value: quantitySchema.optional() }).strict()).max(10000).optional(),
  conditions: z.record(idSchema, z.boolean().nullable()),
  sceneEffects: sceneSelectionsSchema.optional(),
  combatStates: z.array(combatStateIntervalSchema).max(10000).optional(),
  reactionRules: calculationBundleSchema.optional(),
  actionStates: z.array(stateMachineRequestSchema.pick({ startMs: true, initial: true }).extend({
    actorId: idSchema, actions: characterActionsDefinitionSchema,
  })).max(100).optional(),
  enemy: enemySchema.optional(),
  timeline: z.array(z.object({
    id: idSchema, timeMs: millisecondsSchema, order: z.number().int().nonnegative(), actor: idSchema,
    kind: z.enum(['action', 'damage', 'capture', 'state-change']), definition: idSchema, skillId: idSchema.optional(), damage: damageRequestSchema.optional(),
    reactionEvent: projectReactionSchema.optional(), actionId: idSchema.optional(),
    coordinatedMode: z.object({ crit: damageRequestSchema.shape.crit, reaction: damageRequestSchema.shape.reaction }).strict().optional(),
    particleSource: idSchema.optional(),
    particleEffect: idSchema.optional(),
    observedReaction: z.enum(['quicken','freeze','crystallize','lunar-bloom','stellar-conduct']).optional(),
    crystalElement: z.enum(['pyro','hydro','electro','cryo']).optional(),
    confirmedBuff: confirmedBuffSchema.optional(),
    talentHeal: z.object({ definition: definitionRefSchema, healId: idSchema, recipientId: idSchema, facts: hitFactsSchema.optional() }).strict().optional(),
    aura: auraObservationSchema.optional(),
    fieldSwitch: z.object({ crit:damageRequestSchema.shape.crit,reaction:damageRequestSchema.shape.reaction }).strict().optional(),
    summon: z.object({ nearby: z.array(idSchema).max(8), replace: idSchema.optional(), targetInRange: z.boolean(),
      crit: damageRequestSchema.shape.crit, reaction: damageRequestSchema.shape.reaction }).strict().optional(),
    facts: z.record(idSchema, calculationFactSchema).optional(), sourceEventIds: z.array(idSchema).max(1000).optional(),
  }).strict()).max(10000),
  objective: z.object({ damageIds: z.array(idSchema).optional() }).strict(),
}).strict();
export const projectSchema = projectFields.superRefine((project, context) => {
  validateCombatStates(project, context);
  for (const [index,record] of project.timeline.entries()) validateCombatObservations(record.kind,record.facts,context,['timeline',index]);
  project.definitions.forEach((definition, definitionIndex) => {
    definition.nodes.forEach((node, nodeIndex) => {
      if (node.op === 'history' && node.endMs <= node.startMs) context.addIssue({ code: 'custom', message: '累计窗口必须为非空左闭右开区间。', path: ['definitions', definitionIndex, 'nodes', nodeIndex] });
    });
  });
  const captureActors = new Map(project.candidate.actors.map(actor => [actor.id, actor]));
  const captureRecords = new Map(project.timeline.map(record => [record.id, record]));
  const actionStates = new Map((project.actionStates ?? []).map(state => [state.actorId, state]));
  if (actionStates.size !== (project.actionStates?.length ?? 0)) context.addIssue({ code: 'custom', path: ['actionStates'], message: '同一队员只能配置一个动作状态。' });
  for (const [index, state] of (project.actionStates ?? []).entries()) {
    const build = captureActors.get(state.actorId)?.build;
    if (!build || definitionKey(build.character) !== definitionKey(state.actions.character)) {
      context.addIssue({ code: 'custom', path: ['actionStates', index], message: '动作定义必须属于队员的当前角色快照。' });
    }
  }
  project.timeline.forEach((record, index) => {
    if (record.talentHeal && (record.kind !== 'state-change' || !captureActors.has(record.talentHeal.recipientId)
      || record.confirmedBuff || record.observedReaction || record.aura || record.particleSource || record.fieldSwitch
      || record.facts?.healingDone || record.facts?.healingReceived)) {
      context.addIssue({ code: 'custom', path: ['timeline', index, 'talentHeal'], message: '技能治疗须单独记录施救者和受治疗队员。' });
    }
    if (record.talentHeal) {
      const build = captureActors.get(record.actor)?.build;
      const character = build?.character;
      const talent = character?.talents.find(t => t.heals?.some(h => h.id === record.talentHeal!.healId));
      for (const row of record.talentHeal.facts ?? []) for (const [key, fact] of Object.entries(row.values)) {
        const field = combatFactDeclaration(character?.metadata.facts, key);
        const subject = field?.scope === 'query' ? row.subject.kind === 'event' : row.subject.kind === 'actor' && captureActors.has(row.subject.id);
        if (!field || !subject || fact.value && (!valueMatchesType(fact.value, field.type) || fact.value.kind === 'quantity' && fact.value.unit === 'count'
          && (!Number.isSafeInteger(fact.value.value) || fact.value.value < 0))) {
          context.addIssue({ code: 'custom', path: ['timeline',index,'talentHeal','facts',key], message: '治疗事实的字段、主体、类型或数值无效。' });
        }
        if (row.subject.kind === 'event' && talent?.inputs?.some(input => input.id === key) && fact.value?.kind === 'quantity') {
          for (const message of talentInputIssues(talent, { [key]: fact.value.value }, build!.constellation)) {
            context.addIssue({ code: 'custom', path: ['timeline',index,'talentHeal','facts',key], message });
          }
        }
      }
    }
    if (record.particleEffect && !record.particleSource) context.addIssue({code:'custom',path:['timeline',index,'particleEffect'],message:'微粒效果须引用来源记录。'});
    if (record.crystalElement && record.observedReaction !== 'crystallize') context.addIssue({code:'custom',path:['timeline',index,'crystalElement'],message:'结晶元素须与结晶反应一同记录。'});
    if (record.observedReaction && (record.kind !== 'state-change' || !captureActors.get(record.actor)?.build || record.particleSource || record.confirmedBuff || record.aura || record.fieldSwitch)) {
      context.addIssue({code:'custom',path:['timeline',index,'observedReaction'],message:'无独立伤害的反应须记录在触发者的独立状态事件。'});
    }
    if (record.fieldSwitch && record.kind !== 'state-change') context.addIssue({ code:'custom',path:['timeline',index,'fieldSwitch'],message:'换人须记录为独立状态事件。' });
    for (const [key, unit] of Object.entries({ currentEnergy:'energy', energySpent:'energy', skillCooldownMs:'milliseconds', skillCooldownRemaining:'milliseconds' })) {
      const value = record.facts?.[key]?.value;
      if (value && (value.kind !== 'quantity' || value.unit !== unit || value.value < 0 || unit === 'milliseconds' && !Number.isSafeInteger(value.value))) {
        context.addIssue({ code:'custom', path:['timeline',index,'facts',key], message:'能量和冷却须使用对应单位及非负数值。' });
      }
    }
    if (record.confirmedBuff && (record.kind !== 'state-change' || record.particleSource || !captureActors.get(record.actor)?.build)) {
      context.addIssue({ code: 'custom', path: ['timeline', index, 'confirmedBuff'], message: '已触发增益须记录于持有者的独立状态事件。' });
    }
    const confirmed = record.confirmedBuff;
    if (record.aura && (record.kind!=='state-change' || !captureActors.get(record.actor)?.build)) context.addIssue({code:'custom',path:['timeline',index,'aura'],message:'元素附着须记录在受影响队员的状态事件中。'});
    if (confirmed?.remainingMs !== undefined) {
      const build = captureActors.get(record.actor)?.build;
      const key = definitionKey(confirmed);
      const modifiers = build && [build.character, build.weapon, ...build.sets].flatMap(entity =>
        entity?.calculation.bundle.effects.filter(effect => definitionKey(effect.buff ?? effect.identity) === key) ?? []);
      const sceneBuff = project.sceneEffects?.find(s=>s.definition.namespace===confirmed.namespace && s.definition.revision===confirmed.revision && s.definition.buffs.some(b=>b.id===confirmed.id))?.definition.buffs.find(b=>b.id===confirmed.id);
      if (modifiers?.some(effect => effect.lifetime.kind !== 'interval' || confirmed.remainingMs! > effect.lifetime.durationMs)
        || sceneBuff && (!sceneBuff.lifetime || confirmed.remainingMs > sceneBuff.lifetime.durationMs)) {
        context.addIssue({ code: 'custom', path: ['timeline', index, 'confirmedBuff', 'remainingMs'], message: '增益剩余时间超过当前定义的持续时间。' });
      }
    }
    if (record.particleSource) {
      const source = captureRecords.get(record.particleSource);
      if (record.kind !== 'state-change' || !source || source.kind !== 'damage' && !source.observedReaction || !record.sourceEventIds?.includes(source.id)
        || source.timeMs > record.timeMs || source.timeMs === record.timeMs && source.order >= record.order) {
        context.addIssue({ code: 'custom', path: ['timeline', index, 'particleSource'], message: '拾取微粒须引用此前的产球命中。' });
      }
    }
    if (record.summon) {
      const talents = captureActors.get(record.actor)?.build?.character.talents ?? [];
      const talent = talents.find(t => t.summon && (t.id === record.skillId || t.summon.release.skill === record.skillId));
      const ids = [...record.summon.nearby, ...(record.summon.replace ? [record.summon.replace] : [])];
      const valid = ids.every(id => { const cast = captureRecords.get(id); return cast && cast.actor === record.actor
        && cast.skillId === talent?.id && cast.kind === 'action' && cast.summon && (cast.timeMs < record.timeMs || cast.timeMs === record.timeMs && cast.order < record.order); });
      if (!talent || record.kind !== 'action' || !valid || new Set(record.summon.nearby).size !== record.summon.nearby.length
        || record.summon.replace && record.skillId !== talent.id) {
        context.addIssue({ code: 'custom', path: ['timeline', index, 'summon'], message: '邻近与替换的召唤物须引用该角色此前记录的创建动作。' });
      }
    }
    const sources = record.sourceEventIds ?? [];
    if (new Set(sources).size !== sources.length || sources.some(id => id === record.id || !captureRecords.has(id))) {
      context.addIssue({ code: 'custom', path: ['timeline', index, 'sourceEventIds'], message: '来源事件须引用当前项目的不同记录。' });
    }
    if (record.reactionEvent && (record.kind !== 'damage' || record.damage || record.reactionEvent.triggerActorId && !captureActors.has(record.reactionEvent.triggerActorId) || record.reactionEvent.contributors.some(({ actorId }) => !captureActors.has(actorId)))) {
      context.addIssue({ code: 'custom', path: ['timeline', index, 'reactionEvent'], message: '反应伤害须明确引用项目队员，并单独记录。' });
    }
    if (record.actionId !== undefined) {
      const action = actionStates.get(record.actor)?.actions.actions.find(action => action.id === record.actionId);
      const matchesHit = record.damage && action?.hits.some(hit => hit.hitId === record.damage!.hit.hitId);
      if (!action || !(record.kind === 'damage' ? matchesHit : record.kind !== 'capture' && (record.skillId ?? null) === action.skillId)) {
        context.addIssue({ code: 'custom', path: ['timeline', index, 'actionId'], message: '动作必须引用该队员定义的技能、命中或独立事件。' });
      }
    }
    if (record.damage) {
      const build = captureActors.get(record.actor)?.build;
      const found = findBuildHit(build, record.damage.hit);
      for (const row of record.damage.facts ?? []) {
        if (row.subject.kind === 'actor' && !captureActors.has(row.subject.id) || row.subject.kind === 'target' && row.subject.id !== 'target') {
          context.addIssue({ code: 'custom', path: ['timeline', index, 'damage', 'facts'], message: '命中事实引用了不存在的队员或目标。' });
        }
      }
      if (found && build) for (const message of hitEventFactIssues(found.entity, found.talent, subjectFacts(record.damage.facts, { kind: 'event' }) ?? {}, build.constellation, project.candidate.actors.flatMap(actor => actor.build ? [actor.build] : []))) {
        context.addIssue({ code: 'custom', path: ['timeline', index, 'damage', 'facts'], message });
      }
      if (record.kind !== 'damage' || !found) {
        context.addIssue({ code: 'custom', message: '伤害必须引用当前角色快照中的技能和命中，所选输出须存在。', path: ['timeline', index, 'damage'] });
      }
    }
    if (record.skillId !== undefined && (record.kind === 'damage' || !captureActors.get(record.actor)?.build?.character.talents.some(talent => talent.id === record.skillId))) {
      context.addIssue({ code: 'custom', message: '记录的技能引用必须属于当前队员快照。', path: ['timeline', index, 'skillId'] });
    }
    if (record.kind === 'capture') {
      const definition = project.definitions.find(definition => definition.id === record.definition);
      if (!record.skillId || !definition || definition.nodes.length || definition.effects.length || definition.damage !== undefined) {
        context.addIssue({ code: 'custom', message: '独立捕获点须指定所属技能及无公式、无效果的定义；它不表示施放或伤害。', path: ['timeline', index] });
      }
    }
    const capture = record.damage?.capture;
    if (!capture) return;
    const hit = findCharacterHit(captureActors.get(record.actor)?.build?.character, record.damage?.hit)?.hit;
    const path = ['timeline', index, 'damage', 'capture'];
    const issue = (message: string) => context.addIssue({ code: 'custom', message, path });
    if (!hit?.snapshot) { issue('此命中未声明属性捕获规则，不能附加捕获引用。'); return; }
    if (capture.recordId === null) return;
    const source = captureRecords.get(capture.recordId);
    const skillId = source?.kind === 'damage' ? findCharacterHit(captureActors.get(source.actor)?.build?.character, source.damage?.hit)?.talent.id : source?.skillId;
    if (!source || source.actor !== record.actor || skillId !== hit.snapshot.sourceSkillId) {
      issue('捕获来源必须是同一队员快照中指定技能的明确记录。'); return;
    }
    if (source.timeMs > record.timeMs || (source.timeMs === record.timeMs && (source.order > record.order
      || (source.order === record.order && (source.id !== record.id || capture.phase === 'after'))))) {
      issue('捕获来源须在命中之前；同刻依赖必须提供明确顺序。');
    }
  });
  project.candidate.actors.forEach((actor, index) => {
    const snapshot = actor.accountSnapshot;
    if (!snapshot || actor.build) return;
    const slots = new Set<string>();
    const ids = new Set<string>();
    snapshot.artifacts.forEach((artifact, artifactIndex) => {
      const key = artifact.id;
      if (ids.has(key) || slots.has(artifact.slot)) context.addIssue({ code: 'custom', message: '实物圣遗物不能重复占用，同一角色每个部位只能装备一件。', path: ['candidate', 'actors', index, 'accountSnapshot', 'artifacts', artifactIndex] });
      ids.add(key);
      slots.add(artifact.slot);
    });
  });
});
export type Project = z.infer<typeof projectSchema>;
export interface Diagnostic {
  code: 'invalid-input' | 'missing-reference' | 'duplicate-id' | 'cycle' | 'unit' | 'unknown' | 'unsupported' | 'arithmetic' | 'budget' | 'stale-revision';
  path: string;
  message: string;
}
