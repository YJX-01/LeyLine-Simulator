import { combatObservationUnits, findBuildHit, type CombatObservation, type CalculationBundle, type DefinitionRef, type HitRef, type ProjectReaction, type TransformativeFamily } from '@leyline/schema';
import { buildSetCounts, characterHitRef, definitionKey } from '@leyline/schema';
import { buildSchema, projectSchema, type Build, type DamageRequest, type Project } from '@leyline/schema';
import { evaluateTimeline } from '@leyline/engine';
import { nextRecordId } from './workbench-project';
export { defaultEnemy } from './axis-input';

export function addActorFromBuild(project: Project, input: Build, name?: string): string {
  const build = buildSchema.parse(input);
  const id = crypto.randomUUID();
  const weaponVerified = build.weapon?.calculation.bundle.coverage.some(record => record.resolution === 'complete') ?? true;
  const counts = buildSetCounts(build);
  const setsVerified = build.sets.every(set => set.effects
    .filter(effect => effect.pieces <= (counts[set.id] ?? 0))
    .every(effect => effect.coverageRefs.length > 0 && effect.coverageRefs.every(reference =>
      set.calculation.bundle.coverage.some(record => definitionKey(record.identity) === definitionKey(reference) && record.resolution === 'complete'))));
  const source = { kind: build.character.origin === 'builtin' ? 'preset' as const : 'user' as const, reference: build.dataVersion,
    verified: build.character.origin === 'builtin' && build.character.calculation.bundle.coverage.some(record => record.scope.kind === 'context' && record.scope.maxConstellation >= build.constellation && record.resolution === 'complete') };
  project.definitions.push(
    { id: `${id}-character`, name: `${build.character.identity.name} · 角色快照`, version: build.dataVersion, source, nodes: [], effects: [] },
    { id: `${id}-weapon`, name: build.weapon ? `${build.weapon.name} · 武器快照` : '未配武器', version: build.dataVersion, source: {kind:'preset',reference:build.dataVersion,verified:weaponVerified}, nodes: [], effects: [] },
    { id: `${id}-real-damage`, name: `${build.character.identity.name} · 真实技能伤害`, version: build.dataVersion, source: { ...source, verified: source.verified && weaponVerified && setsVerified },
      nodes: [{ id: 'real-damage', op: 'game-damage' }], damage: 'real-damage', effects: [] },
  );
  project.candidate.actors.push({ id, name: name || build.character.identity.name, character: `${id}-character`, weapon: `${id}-weapon`, element: build.character.identity.element, inputs: {}, build });
  return id;
}

export function addCombatObservation(project: Project, actorId: string, timeMs: number, field: CombatObservation, reading: number | boolean) {
  const actor = project.candidate.actors.find(actor => actor.id === actorId);
  if (!actor?.build) throw new Error('请选择有配装的队员。');
  const id = nextRecordId(project);
  const unit = combatObservationUnits[field];
  if (unit === 'boolean' ? typeof reading !== 'boolean' : typeof reading !== 'number') throw new Error('记录值与战斗事件类型不符。');
  const value = unit === 'boolean' ? {kind:'boolean' as const,value:Boolean(reading)} : {kind:'quantity' as const,unit,value:Number(reading)};
  const record: Project['timeline'][number] = { id, actor: actorId, timeMs, order: Math.max(-1, ...project.timeline.map(entry => entry.order)) + 1,
    kind: 'state-change', definition: actor.character, facts: { [field]: { value,
      provenance: 'explicit', sourceRefs: [] } } };
  projectSchema.parse({ ...project, timeline: [...project.timeline, record] });
  project.timeline.push(record);
  return id;
}
export function addTalentHeal(project: Project, actorId: string, recipientId: string, healId: string, timeMs: number, facts?: DamageRequest['facts']) {
  const actor = project.candidate.actors.find(member => member.id === actorId);
  const character = actor?.build?.character;
  if (!actor || !character || !character.talents.some(t => t.heals?.some(h => h.id === healId))
    || !project.candidate.actors.some(member => member.id === recipientId && member.build)) throw new Error('请选择治疗技能和有配装的受治疗队员。');
  const { namespace, id, revision } = character;
  const record = { id: nextRecordId(project), kind: 'state-change' as const, actor: actorId, timeMs,
    order: Math.max(-1, ...project.timeline.map(row => row.order)) + 1, definition: actor.character,
    talentHeal: { definition: { namespace, id, revision }, healId, recipientId, ...(facts?.length ? { facts } : {}) } };
  project.timeline = projectSchema.parse({ ...project, timeline: [...project.timeline, record] }).timeline;
  return record.id;
}

export function addParticlePickup(project: Project, actorId: string, source: string, timeMs: number, effect?: string) {
  const actor = project.candidate.actors.find(a => a.id === actorId);
  if (!actor || project.timeline.some(r => r.particleSource === source && r.particleEffect === effect)) throw new Error('请选择队员和未拾取的微粒来源。');
  const id = nextRecordId(project);
  const record: Project['timeline'][number] = { id, actor: actorId, timeMs, order: Math.max(-1, ...project.timeline.map(e => e.order)) + 1,
    kind: 'state-change', definition: actor.character, sourceEventIds: [source], particleSource: source, ...(effect ? {particleEffect:effect} : {}) };
  projectSchema.parse({ ...project, timeline: [...project.timeline, record] });
  project.timeline.push(record);
  return id;
}

export function addReactionObservation(project: Project, actorId: string, timeMs: number, reaction: NonNullable<Project['timeline'][number]['observedReaction']>, crystalElement?: Project['timeline'][number]['crystalElement']) {
  const actor = project.candidate.actors.find(member => member.id === actorId);
  if (!actor?.build) throw new Error('请选择触发反应的队员。');
  const record: Project['timeline'][number] = { id: nextRecordId(project), actor:actorId, timeMs,
    order: Math.max(-1,...project.timeline.map(r=>r.order))+1, kind:'state-change', definition:actor.character, observedReaction:reaction, ...(crystalElement ? {crystalElement} : {}) };
  projectSchema.parse({...project,timeline:[...project.timeline,record]});
  project.timeline.push(record);
  return record.id;
}

export function addAuraObservation(project:Project,actor:string,timeMs:number,aura:NonNullable<Project['timeline'][number]['aura']>) {
  const member=project.candidate.actors.find(a=>a.id===actor);
  if (!member?.build) throw new Error('请选择受到元素附着的队员。');
  const record:Project['timeline'][number]={id:nextRecordId(project),actor,definition:member.character,kind:'state-change',timeMs,
    order:Math.max(-1,...project.timeline.map(r=>r.order))+1,aura};
  projectSchema.parse({...project,timeline:[...project.timeline,record]});
  project.timeline.push(record);
  return record.id;
}

export function addFieldChange(project:Project,actorId:string,timeMs:number,change:{mode?:NonNullable<Project['timeline'][number]['fieldSwitch']>;energy?:number}) {
  const actor=project.candidate.actors.find(a=>a.id===actorId);
  if (!actor || !change.mode && change.energy===undefined) throw new Error('请选择队员和要记录的换人或能量。');
  const record:Project['timeline'][number]={ id:nextRecordId(project),actor:actorId,timeMs,order:Math.max(-1,...project.timeline.map(r=>r.order))+1,kind:'state-change',definition:actor.character,
    ...(change.mode ? {fieldSwitch:change.mode} : {}), ...(change.energy===undefined ? {} : {facts:{currentEnergy:{value:{kind:'quantity',unit:'energy',value:change.energy},provenance:'explicit',sourceRefs:[]}}}) };
  projectSchema.parse({...project,timeline:[...project.timeline,record]});
  project.timeline.push(record);
  return record.id;
}

export function addConfirmedBuff(project: Project, actorId: string, buff: DefinitionRef, timeMs: number, remainingMs?: number) {
  const actor = project.candidate.actors.find(a => a.id === actorId);
  if (!actor?.build) throw new Error('请选择持有增益的队员。');
  const id = nextRecordId(project);
  const record: Project['timeline'][number] = { id, actor: actorId, timeMs, order: Math.max(-1,...project.timeline.map(entry => entry.order)) + 1,
    kind: 'state-change', definition: actor.character, confirmedBuff: { ...buff, ...(remainingMs === undefined ? {} : { remainingMs }) } };
  projectSchema.parse({ ...project, timeline: [...project.timeline,record] });
  project.timeline.push(record);
  return id;
}

export function addTransformativeReaction(project: Project, actorId: string, family: TransformativeFamily, element: ProjectReaction['element'], timeMs: number, rules: CalculationBundle, replaceId?:string) {
  return addSingleContributorReaction(project, actorId, family, element, timeMs, rules, replaceId);
}

export const singleContributorLunarElements = { 'lunar-charged': 'electro', 'lunar-crystallize': 'geo' } as const;
export type SingleContributorReaction = ProjectReaction['family'];

export function addSingleContributorReaction(project: Project, actorId: string, family: SingleContributorReaction, element: ProjectReaction['element'], timeMs: number, rules: CalculationBundle, replaceId?: string, coefficient?: number) {
  const actor = project.candidate.actors.find(a => a.id === actorId);
  if (!actor?.build) throw new Error('请选择触发反应的队员。');
  const previous = project.timeline.find(r=>r.id===replaceId);
  if (replaceId && (!previous || previous.kind !== 'damage' || previous.actor !== actorId)) throw new Error('反应引用的伤害记录已失效。');
  const id = previous?.id ?? nextRecordId(project);
  const record: Project['timeline'][number] = { id, actor: actorId, timeMs, order: previous?.order ?? Math.max(-1,...project.timeline.map(entry => entry.order)) + 1,
    kind: 'damage', definition: actorId + '-real-damage', reactionEvent: { family, element, triggerActorId: actorId, coefficient,
      contributors: [{ actorId, qualified: true, crit: 'noncritical' }] } };
  const timeline = previous ? project.timeline.map(r=>r.id===id ? record : r) : [...project.timeline,record];
  const checked = projectSchema.parse({ ...project, reactionRules: rules, timeline });
  project.reactionRules = checked.reactionRules;
  project.timeline = checked.timeline;
  if (!previous && project.objective.damageIds && !project.objective.damageIds.includes(id)) project.objective.damageIds.push(id);
  return id;
}

export function addSkillAction(project: Project, actorId: string, skillId: string, timeMs: number, summon?: Project['timeline'][number]['summon']): string {
  const actor = project.candidate.actors.find(entry => entry.id === actorId);
  const build = actor?.build;
  const skill = build?.character.talents.find(entry => entry.id === skillId);
  if (!build || !skill || !Number.isInteger(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('请选择队员、技能和合法的整数毫秒时间。');
  const definitionId = `${actorId}-action-${skillId}`;
  const definition = { id: definitionId, name: skill.name, version: build.dataVersion,
    source: { kind: build.character.origin === 'builtin' ? 'preset' as const : 'user' as const, reference: build.dataVersion, verified: false }, nodes: [], effects: [] };
  const id = nextRecordId(project);
  const record: Project['timeline'][number] = { id, actor: actorId, kind: 'action', definition: definitionId, skillId, timeMs, ...(summon ? { summon } : {}),
    order: Math.max(-1, ...project.timeline.map(entry => entry.order)) + 1 };
  const definitions = project.definitions.some(entry => entry.id === definitionId) ? project.definitions : [...project.definitions, definition];
  const parsed = projectSchema.parse({ ...project, definitions, timeline: [...project.timeline, record] });
  if (definitions !== project.definitions) project.definitions.push(parsed.definitions[parsed.definitions.length - 1]);
  project.timeline.push(parsed.timeline[parsed.timeline.length - 1]);
  return id;
}

/** An explicitly supplied read anchor, independent of casts, hits and effect triggers. */
export function addAttributeCapture(project: Project, actorId: string, skillId: string, timeMs: number): string {
  const actor = project.candidate.actors.find(actor => actor.id === actorId);
  const skill = actor?.build?.character.talents.find(skill => skill.id === skillId);
  if (!actor?.build || !skill || !Number.isInteger(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('请选择来源技能，并填写合法的捕获时刻。');
  const definitionId = `${actorId}-attribute-capture`;
  const definition = { id: definitionId, name: '独立属性捕获', version: actor.build.dataVersion,
    source: { kind: 'user' as const, reference: `${actor.build.character.id}@${actor.build.character.revision}`, verified: false }, nodes: [], effects: [] };
  const id = nextRecordId(project);
  const next = projectSchema.parse({ ...project,
    definitions: project.definitions.some(entry => entry.id === definitionId) ? project.definitions : [...project.definitions, definition],
    timeline: [...project.timeline, { id, actor: actorId, kind: 'capture', skillId, definition: definitionId, timeMs, order: Math.max(-1, ...project.timeline.map(record => record.order)) + 1 }],
  });
  project.definitions = next.definitions;
  project.timeline = next.timeline;
  return id;
}

export function addSkillHit(project: Project, actorId: string, skillId: string, hitIndex: number, timeMs: number,
  choices: Omit<DamageRequest, 'hit'> = { crit: null, reaction: null }): string {
  const actor = project.candidate.actors.find(entry => entry.id === actorId);
  const skill = actor?.build?.character.talents.find(entry => entry.id === skillId);
  if (!actor || !skill || !Number.isInteger(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('请选择队员、技能和合法的整数毫秒时间。');
  const selectedHit = skill.hits[hitIndex];
  if (!Number.isInteger(hitIndex) || !selectedHit) throw new Error('请选择此技能已绑定的命中。');
  return addSelectedHit(project, actor.id, characterHitRef(actor.build!.character, selectedHit.id), timeMs, choices);
}

export function addSelectedHit(project: Project, actorId: string, hit: HitRef, timeMs: number,
  choices: Omit<DamageRequest, 'hit'> = { crit: null, reaction: null }): string {
  const actor = project.candidate.actors.find(entry => entry.id === actorId);
  if (!actor || !findBuildHit(actor.build, hit)) throw new Error('此配装未授予所选命中。');
  const id = nextRecordId(project);
  const record: Project['timeline'][number] = { id, timeMs, order: Math.max(-1, ...project.timeline.map(record => record.order)) + 1,
    actor: actor.id, kind: 'damage', definition: actor.id + '-real-damage', damage: { ...choices, hit } };
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
