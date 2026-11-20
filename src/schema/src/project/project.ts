import { APP_VERSION } from '../version.mjs';
import { z } from 'zod';
import { idSchema,millisecondsSchema,quantitySchema } from '../common/values';
import { buildSchema } from '../account/build';
import { damageRequestSchema } from './damage';
import { enemySchema } from './enemy';
import { talentInputIssues } from '../content/talent';
import { elements } from '../content/stats';
import { ruleDefinitionSchema } from './expressions';
import { combatStateIntervalSchema, validateCombatStates } from './combat-state';
import { calculationBundleSchema } from '../calculation/bundle';
import { calculationFactSchema } from '../calculation/binding';
import { stateMachineRequestSchema } from '../calculation/state-machine';
import { characterActionsDefinitionSchema } from '../content/actions';
import { definitionKey } from '../calculation/values';
import { projectReactionSchema } from './reaction-event';
import { canTryOrdinaryHit, ordinaryTrialId } from '../calculation/hit-bindings.mjs';
export { ordinaryTrialId };
const projectFields = z.object({
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
    facts: z.record(idSchema, calculationFactSchema).optional(), sourceEventIds: z.array(idSchema).max(1000).optional(),
  }).strict()).max(10000),
  objective: z.object({ damageIds: z.array(idSchema).optional() }).strict(),
}).strict();
export const projectSchema = projectFields.superRefine((project, context) => {
  validateCombatStates(project, context);
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
    const sources = record.sourceEventIds ?? [];
    if (new Set(sources).size !== sources.length || sources.some(id => id === record.id || !captureRecords.has(id))) {
      context.addIssue({ code: 'custom', path: ['timeline', index, 'sourceEventIds'], message: '来源事件须引用当前项目的不同记录。' });
    }
    if (record.reactionEvent && (record.kind !== 'damage' || record.damage || record.reactionEvent.contributors.some(({ actorId }) => !captureActors.has(actorId)))) {
      context.addIssue({ code: 'custom', path: ['timeline', index, 'reactionEvent'], message: '反应伤害须明确引用项目队员，并单独记录。' });
    }
    if (record.actionId !== undefined) {
      const action = actionStates.get(record.actor)?.actions.actions.find(action => action.id === record.actionId);
      const matchesHit = record.damage && action?.hits.some(hit => hit.skillId === record.damage!.skillId && hit.hitId === record.damage!.hitId
        && (record.damage!.outputId === null || hit.outputIds.includes(record.damage!.outputId)));
      if (!action || !(record.kind === 'damage' ? matchesHit : record.kind !== 'capture' && (record.skillId ?? null) === action.skillId)) {
        context.addIssue({ code: 'custom', path: ['timeline', index, 'actionId'], message: '动作必须引用该队员定义的技能、命中或独立事件。' });
      }
    }
    if (record.damage) {
      const actor = captureActors.get(record.actor), skill = actor?.build?.character.talents.find(skill => skill.id === record.damage!.skillId);
      const hit = skill?.hits.find(hit => hit.id === record.damage!.hitId);
      const output = record.damage.outputId;
      const trial = skill && hit && output === ordinaryTrialId(hit.id) && canTryOrdinaryHit(skill, hit);
      if (record.kind !== 'damage' || !hit || !(output === null || trial || hit.outputs.some(candidate => candidate.id === output))) {
        context.addIssue({ code: 'custom', message: '伤害必须引用当前角色快照中的技能和命中，所选输出须存在。', path: ['timeline', index, 'damage'] });
      }
    }
    if (record.damage?.inputs) {
      const talent = captureActors.get(record.actor)?.build?.character.talents.find(talent => talent.id === record.damage!.skillId);
      const messages = record.kind !== 'damage' || !talent ? ['命中输入必须引用当前队员快照中的技能。'] : talentInputIssues(talent, record.damage.inputs, captureActors.get(record.actor)!.build!.constellation);
      for (const message of messages) context.addIssue({ code: 'custom', message, path: ['timeline', index, 'damage', 'inputs'] });
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
    const hit = captureActors.get(record.actor)?.build?.character.talents
      .find(talent => talent.id === record.damage!.skillId)?.hits.find(hit => hit.id === record.damage!.hitId);
    const path = ['timeline', index, 'damage', 'capture'];
    const issue = (message: string) => context.addIssue({ code: 'custom', message, path });
    if (!hit?.snapshot) { issue('此命中未声明属性捕获规则，不能附加捕获引用。'); return; }
    if (capture.recordId === null) return;
    const source = captureRecords.get(capture.recordId);
    const skillId = source?.kind === 'damage' ? source.damage?.skillId : source?.skillId;
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
