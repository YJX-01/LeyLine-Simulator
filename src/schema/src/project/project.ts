import { z } from 'zod';
import { idSchema,millisecondsSchema,quantitySchema } from '../common/values';
import { buildSchema } from '../account/build';
import { damageRequestSchema } from './damage';
import { enemySchema } from './enemy';
import { talentInputIssues } from '../content/talent';
import { ruleDefinitionSchema, requiresDependencyDefinition } from './expressions';
import { combatStateIntervalSchema, validateCombatStates } from './combat-state';
export const projectSchema = z.object({
  schemaVersion: z.literal(2), rulesVersion: z.literal('timeline-v1'), calculationProfile: z.enum(['direct','dependency']), id: idSchema, name: idSchema.optional(), revision: idSchema,
  definitions: z.array(ruleDefinitionSchema).max(200),
  candidate: z.object({
    id: idSchema, actors: z.array(z.object({ id: idSchema, name: idSchema.optional(), character: idSchema, weapon: idSchema, inputs: z.record(idSchema, quantitySchema), build: buildSchema.optional(),
      accountSnapshot: z.object({ accountId: idSchema, characterId: idSchema, weapon: z.string().max(160),
        artifacts: z.array(z.object({ id: idSchema, name: idSchema, slot: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']), attack: z.number().finite().nonnegative() }).strict()).max(5),
      }).strict().optional(),
    }).strict()).max(100),
  }).strict(),
  effectRevisions: z.array(z.object({ instanceId: z.string().min(1).max(2000), disabled: z.boolean(), value: quantitySchema.optional() }).strict()).max(10000).optional(),
  conditions: z.record(idSchema, z.boolean().nullable()),
  combatStates: z.array(combatStateIntervalSchema).max(10000).optional(),
  enemy: enemySchema.optional(),
  timeline: z.array(z.object({
    id: idSchema, timeMs: millisecondsSchema, order: z.number().int().nonnegative(), actor: idSchema,
    kind: z.enum(['action', 'damage']), definition: idSchema, skillId: idSchema.optional(), damage: damageRequestSchema.optional(),
  }).strict()).max(10000),
  objective: z.object({ damageIds: z.array(idSchema).optional() }).strict(),
}).strict().superRefine((project, context) => {
  validateCombatStates(project, context);
  if (project.calculationProfile === 'direct') {
    if (project.effectRevisions !== undefined || project.definitions.some(requiresDependencyDefinition)) {
      context.addIssue({ code: 'custom', message: '属性读取、捕获、累计和效果修订需要明确采用依赖求值配置。', path: ['rulesVersion'] });
    }
  }
  project.definitions.forEach((definition, definitionIndex) => {
    definition.nodes.forEach((node, nodeIndex) => {
      if (node.op === 'history' && node.endMs <= node.startMs) context.addIssue({ code: 'custom', message: '累计窗口必须为非空左闭右开区间。', path: ['definitions', definitionIndex, 'nodes', nodeIndex] });
    });
  });
  const captureActors = new Map(project.candidate.actors.map(actor => [actor.id, actor]));
  const captureRecords = new Map(project.timeline.map(record => [record.id, record]));
  project.timeline.forEach((record, index) => {
    if (record.damage?.inputs) {
      const talent = captureActors.get(record.actor)?.build?.character.talents.find(talent => talent.id === record.damage!.skillId);
      const messages = record.kind !== 'damage' || !talent ? ['命中输入必须引用当前队员快照中的技能。'] : talentInputIssues(talent, record.damage.inputs, captureActors.get(record.actor)!.build!.constellation);
      for (const message of messages) context.addIssue({ code: 'custom', message, path: ['timeline', index, 'damage', 'inputs'] });
    }
    if (record.skillId !== undefined && (record.kind !== 'action' || !captureActors.get(record.actor)?.build?.character.talents.some(talent => talent.id === record.skillId))) {
      context.addIssue({ code: 'custom', message: '动作技能引用必须属于当前队员快照。', path: ['timeline', index, 'skillId'] });
    }
    const capture = record.damage?.capture;
    if (!capture) return;
    const hit = captureActors.get(record.actor)?.build?.character.talents
      .find(talent => talent.id === record.damage!.skillId)?.hits[record.damage!.hitIndex];
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
  const occupied = new Set<string>();
  project.candidate.actors.forEach((actor, index) => {
    if (actor.build) {
      const accountId = actor.build.inventoryAccountId ?? 'local-real-inventory';
      actor.build.artifacts.forEach((artifact, artifactIndex) => {
        const key = JSON.stringify([artifact.inventoryAccountId ?? accountId, artifact.id]);
        if (occupied.has(key)) context.addIssue({ code: 'custom', message: '同一账号的实物圣遗物不能在队伍中重复占用。', path: ['candidate','actors',index,'build','artifacts',artifactIndex] });
        occupied.add(key);
      });
    }
    const snapshot = actor.accountSnapshot;
    if (!snapshot || actor.build) return;
    const slots = new Set<string>();
    snapshot.artifacts.forEach((artifact, artifactIndex) => {
      const key = JSON.stringify([snapshot.accountId, artifact.id]);
      if (occupied.has(key) || slots.has(artifact.slot)) context.addIssue({ code: 'custom', message: '实物圣遗物不能重复占用，同一角色每个部位只能装备一件。', path: ['candidate', 'actors', index, 'accountSnapshot', 'artifacts', artifactIndex] });
      occupied.add(key);
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
