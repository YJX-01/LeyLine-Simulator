import { buildSchema, projectSchema, type Build, type DamageRequest, type Project } from '@leyline/schema';
import { evaluateTimeline } from '@leyline/engine';
import { nextRecordId } from './workbench-project';

export { defaultEnemy } from './axis-input';

export function addActorFromBuild(project: Project, input: Build, name?: string): string {
  const build = buildSchema.parse(input);
  const id = crypto.randomUUID();
  const weaponVerified = build.weapon?.calculation.bundle.coverage.some(record => record.resolution === 'complete') ?? true;
  const source = { kind: build.character.origin === 'builtin' ? 'preset' as const : 'user' as const, reference: build.dataVersion,
    verified: build.character.origin === 'builtin' && build.character.calculation.bundle.coverage.some(record => record.scope.kind === 'context' && record.scope.maxConstellation >= build.constellation && record.resolution === 'complete') };
  project.definitions.push(
    { id: `${id}-character`, name: `${build.character.identity.name} · 角色快照`, version: build.dataVersion, source, nodes: [], effects: [] },
    { id: `${id}-weapon`, name: build.weapon ? `${build.weapon.name} · 武器快照` : '未配武器', version: build.dataVersion, source: {kind:'preset',reference:build.dataVersion,verified:weaponVerified}, nodes: [], effects: [] },
    { id: `${id}-real-damage`, name: `${build.character.identity.name} · 真实技能伤害`, version: build.dataVersion, source: {...source,verified:source.verified && weaponVerified && build.sets.every(set=>set.effects.filter(effect=>effect.pieces<=build.artifacts.filter(item=>item.setId===set.id).length).every(effect=>effect.coverageRefs.every(reference => set.calculation.bundle.coverage.some(record => record.identity.id === reference.id && record.resolution === 'complete'))))},
      nodes: [{ id: 'real-damage', op: 'game-damage' }], damage: 'real-damage', effects: [] },
  );
  project.candidate.actors.push({ id, name: name || build.character.identity.name, character: `${id}-character`, weapon: `${id}-weapon`, inputs: {}, build: build });
  return id;
}

export function addSkillAction(project: Project, actorId: string, skillId: string, timeMs: number, schema = projectSchema): string {
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
  const parsed = schema.parse({ ...project, definitions, timeline: [...project.timeline, record] });
  if (definitions !== project.definitions) project.definitions.push(parsed.definitions[parsed.definitions.length - 1]);
  project.timeline.push(parsed.timeline[parsed.timeline.length - 1]);
  return id;
}

/** An explicitly supplied read anchor, independent of casts, hits and effect triggers. */
export function addAttributeCapture(project: Project, actorId: string, skillId: string, timeMs: number, schema = projectSchema): string {
  const actor = project.candidate.actors.find(actor => actor.id === actorId);
  const skill = actor?.build?.character.talents.find(skill => skill.id === skillId);
  if (!actor?.build || !skill || !Number.isInteger(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('请选择来源技能，并填写合法的捕获时刻。');
  const definitionId = `${actorId}-attribute-capture`;
  const definition = { id: definitionId, name: '独立属性捕获', version: actor.build.dataVersion,
    source: { kind: 'user' as const, reference: `${actor.build.character.id}@${actor.build.character.revision}`, verified: false }, nodes: [], effects: [] };
  const id = nextRecordId(project);
  const next = schema.parse({ ...project, calculationProfile: 'dependency',
    definitions: project.definitions.some(entry => entry.id === definitionId) ? project.definitions : [...project.definitions, definition],
    timeline: [...project.timeline, { id, actor: actorId, kind: 'capture', skillId, definition: definitionId, timeMs, order: Math.max(-1, ...project.timeline.map(record => record.order)) + 1 }],
  });
  project.calculationProfile = next.calculationProfile;
  project.definitions = next.definitions;
  project.timeline = next.timeline;
  return id;
}

export function addSkillHit(project: Project, actorId: string, skillId: string, hitIndex: number, timeMs: number, choices: Pick<DamageRequest,'crit'|'reaction'|'conditions'|'stateOverrides'|'capture'|'inputs'|'effectApplications'> = {crit:null,reaction:null}): string {
  const actor = project.candidate.actors.find(entry => entry.id === actorId);
  const skill = actor?.build?.character.talents.find(entry => entry.id === skillId);
  if (!actor || !skill || !Number.isInteger(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('请选择队员、技能和合法的整数毫秒时间。');
  if (!Number.isInteger(hitIndex) || !skill.hits[hitIndex]?.outputs.length) throw new Error('该技能或命中类型尚未核验。');
  const selectedHit = skill.hits[hitIndex];
  if (selectedHit.outputs.length !== 1) throw new Error('请选择明确的伤害输出。');
  const id = nextRecordId(project);
  const record: Project['timeline'][number] = { id, timeMs, order: Math.max(-1, ...project.timeline.map(record => record.order)) + 1,
    actor: actor.id, kind: 'damage', definition: `${actor.id}-real-damage`, damage: { skillId, hitId: selectedHit.id, outputId: selectedHit.outputs[0].id, ...choices } };
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
  const result = evaluateTimeline(parsed);
  if (result.status === 'invalid' || result.diagnostics.some(diagnostic => diagnostic.code === 'stale-revision' && diagnostic.path.startsWith(`timeline.${recordId}.`))) {
    throw new Error('效果适用事实引用或作用范围无效，当前项目保持不变。');
  }
  project.timeline[index] = parsed.timeline[index];
}
