import { buildSchema, elements, projectSchema, type Build, type DamageRequest, type Enemy, type Project } from '@leyline/schema';
import { evaluateTimeline } from '@leyline/engine';
import { nextRecordId } from './workbench-project';

export function defaultEnemy(): Enemy {
  return { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
}

export function addActorFromBuild(project: Project, input: Build, name?: string): string {
  const build = buildSchema.parse(input);
  const id = crypto.randomUUID();
  const source = { kind: build.character.origin === 'builtin' ? 'preset' as const : 'user' as const, reference: build.dataVersion,
    verified: build.character.origin === 'builtin' && build.character.capabilities.calculation.supported && build.constellation === 0 };
  project.definitions.push(
    { id: `${id}-character`, name: `${build.character.identity.name} · 角色快照`, version: build.dataVersion, source, nodes: [], effects: [] },
    { id: `${id}-weapon`, name: `${build.weapon.name} · 武器快照`, version: build.dataVersion, source: {kind:'preset',reference:build.dataVersion,verified:build.weapon.support.supported}, nodes: [], effects: [] },
    { id: `${id}-real-damage`, name: `${build.character.identity.name} · 真实技能伤害`, version: build.dataVersion, source: {...source,verified:source.verified && build.weapon.support.supported && build.sets.every(set=>set.effects.filter(effect=>effect.pieces<=build.artifacts.filter(item=>item.setId===set.id).length).every(effect=>effect.support.supported))},
      nodes: [{ id: 'real-damage', op: 'game-damage' }], damage: 'real-damage', effects: [] },
  );
  project.candidate.actors.push({ id, name: name || build.character.identity.name, character: `${id}-character`, weapon: `${id}-weapon`, inputs: {}, build: build });
  return id;
}

export function addSkillAction(project: Project, actorId: string, skillId: string, timeMs: number): string {
  const actor = project.candidate.actors.find(entry => entry.id === actorId);
  const build = actor?.build;
  const skill = build?.character.talents.find(entry => entry.id === skillId);
  if (!build || !skill || !Number.isInteger(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('请选择队员、技能和合法的整数毫秒时间。');
  const definitionId = `${actorId}-action-${skillId}`;
  const definition = { id: definitionId, name: skill.name, version: build.dataVersion,
    source: { kind: build.character.origin === 'builtin' ? 'preset' as const : 'user' as const, reference: build.dataVersion, verified: false }, nodes: [], effects: [] };
  const id = nextRecordId(project);
  const record: Project['timeline'][number] = { id, actor: actorId, kind: 'action', definition: definitionId, skillId, timeMs,
    order: Math.max(-1, ...project.timeline.map(entry => entry.order)) + 1 };
  const definitions = project.definitions.some(entry => entry.id === definitionId) ? project.definitions : [...project.definitions, definition];
  const parsed = projectSchema.parse({ ...project, definitions, timeline: [...project.timeline, record] });
  if (definitions !== project.definitions) project.definitions.push(parsed.definitions[parsed.definitions.length - 1]);
  project.timeline.push(parsed.timeline[parsed.timeline.length - 1]);
  return id;
}

export function addSkillHit(project: Project, actorId: string, skillId: string, hitIndex: number, timeMs: number, choices: Pick<DamageRequest,'crit'|'reaction'|'conditions'|'stateOverrides'|'capture'|'inputs'|'effectApplications'> = {crit:null,reaction:null}): string {
  const actor = project.candidate.actors.find(entry => entry.id === actorId);
  const skill = actor?.build?.character.talents.find(entry => entry.id === skillId);
  if (!actor || !skill || !Number.isInteger(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('请选择队员、技能和合法的整数毫秒时间。');
  if (!skill.support.supported || !Number.isInteger(hitIndex) || !skill.hits[hitIndex]) throw new Error('该技能或命中类型尚未核验。');
  const id = nextRecordId(project);
  const record: Project['timeline'][number] = { id, timeMs, order: Math.max(-1, ...project.timeline.map(record => record.order)) + 1,
    actor: actor.id, kind: 'damage', definition: `${actor.id}-real-damage`, damage: { skillId, hitIndex, ...choices } };
  const parsed = projectSchema.parse({ ...project, timeline: [...project.timeline, record] });
  if (record.damage?.effectApplications?.length && evaluateTimeline(parsed).status === 'invalid') throw new Error('效果适用事实引用或作用范围无效，当前项目保持不变。');
  project.timeline.push(parsed.timeline[parsed.timeline.length - 1]);
  if (project.objective.damageIds) project.objective.damageIds.push(id);
  return id;
}

/** A per-hit factual assertion; source identity and applicability are checked by the shared engine. */
export function setDamageEffectApplication(project: Project, recordId: string, instanceId: string, active: boolean | null): void {
  const index = project.timeline.findIndex(record => record.id === recordId);
  const record = project.timeline[index];
  if (!record || record.kind !== 'damage' || !record.damage) throw new Error('请选择已有的技能伤害记录。');
  const effectApplications = [...(record.damage.effectApplications ?? []).filter(application => application.instanceId !== instanceId), { instanceId, active }];
  const replacement = { ...record, damage: { ...record.damage, effectApplications } };
  const timeline = project.timeline.map((entry, entryIndex) => entryIndex === index ? replacement : entry);
  const parsed = projectSchema.parse({ ...project, timeline });
  if (evaluateTimeline(parsed).status === 'invalid') throw new Error('效果适用事实引用或作用范围无效，当前项目保持不变。');
  project.timeline[index] = parsed.timeline[index];
}
