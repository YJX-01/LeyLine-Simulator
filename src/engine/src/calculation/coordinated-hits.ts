import { definitionKey, characterHitRef, hitBelongsToCharacter, findBuildHit, putHitFact, subjectFacts, talentParameterAt, type Diagnostic, type Project } from '@leyline/schema';
import { authoredHitEntries } from '@leyline/schema/hit-bindings';
import { actorIsOnField } from './build-context';
import { prepareProjectRuntime, recordedAttackApplies } from './project';
import { resolveCombatChanges } from './combat-changes';

type RecordEntry = Project['timeline'][number];
type ActorBuilds = ReadonlyMap<string, Project['candidate']['actors'][number]['build']>;
const activeFlag = { kind: 'boolean' as const, value: true };

export function resolveTriggeredHits(project: Project) {
  const byActor = new Map(project.candidate.actors.map(actor => [actor.id, actor.build]));
  const coordinated = resolveCoordinatedHits(project, byActor);
  const confirmed = applyConfirmedHits(coordinated.project, byActor);
  return { project: confirmed.project, diagnostics: [...coordinated.diagnostics, ...confirmed.diagnostics] };
}

function withTriggerFact(record: RecordEntry, key: string, value: boolean | null): RecordEntry {
  const damage = structuredClone(record.damage!);
  putHitFact(damage.facts ??= [], { kind: 'event' }, key, value === null ? null : { kind: 'boolean', value }, 'derived');
  return { ...record, damage };
}

/** A projection uses its own cooldown, cast charges and source. Its damage belongs to the on-field attacker. */
function resolveCoordinatedHits(project: Project, byActor: ActorBuilds): { project: Project; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const rules = project.candidate.actors.flatMap(({ id: owner, build }) => !build ? [] : build.character.talents.flatMap(talent =>
    talent.hits.filter(hit => hit.coordinated).flatMap(hit => {
      const unlock = authoredHitEntries(build.character.metadata, talent.id).find(entry => entry.hit.id === hit.id)?.unlock;
      return unlock && build[unlock.state] < unlock.rank ? [] : [{ owner, build, talent, hit, rule: hit.coordinated! }];
    })));
  if (!rules.length || !project.timeline.some(entry => entry.damage && entry.damage.hit.definition.group === 'characters'
    && !findBuildHit(byActor.get(entry.actor), entry.damage.hit)?.hit.coordinated)) return { project, diagnostics };
  const prepared = prepareProjectRuntime(project);
  if (!prepared.ok) return { project, diagnostics };
  const { runtime } = prepared;
  resolveCombatChanges(project,runtime);
  const rejected = new Set(runtime.context.events.filter(e=>e.occurred === false).map(e=>e.id));
  const records = [...project.timeline].sort((a, b) => a.timeMs - b.timeMs || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sourceIds = new Set(records.filter(record => record.damage?.hit.definition.group === 'characters' && !record.reactionEvent
    && !findBuildHit(byActor.get(record.actor), record.damage.hit)?.hit.coordinated).map(record => record.id));
  const field = new Map<string, boolean | undefined>(), attacks = new Map<string, boolean | undefined>();
  const reserved = new Set(records.map(record => record.id)), used = new Set<string>(), after = new Map<string, RecordEntry[]>();
  const duplicates = new Map<string, string>(), excluded = new Map<string, RecordEntry>();
  let sequence = 0, size = records.length;
  for (const { owner, build, talent, hit, rule } of rules) {
    const hitRef = characterHitRef(build.character, hit.id);
    const manual = records.filter(record => record.actor === owner && record.damage?.hit.hitId === hit.id
      && hitBelongsToCharacter(record.damage.hit,build.character));
    const unknownSources = new Set<string>();
    const rank = runtime.team.talentRank(build, talent.category);
    let cast: RecordEntry | undefined, end = 0, charges = 0, next = 0, uncertainUntil = 0;
    for (const record of records) {
      if (rule.window && record.kind === 'action' && record.actor === owner && record.skillId === talent.id && !rejected.has(record.id)) {
        cast = record;
        const duration = talentParameterAt(talent, rule.window.duration, rank);
        const limit = talentParameterAt(talent, rule.window.charges, rank);
        const possible = talent.parameters.find(p => p.id === rule.window!.duration)!.values.slice(rank.level - 1, rank.upperLevel ?? rank.level);
        end = record.timeMs + (duration ?? Math.max(...possible)) * 1000;
        charges = limit ?? 1;
        uncertainUntil = duration === undefined || limit === undefined ? end : 0;
        if (uncertainUntil) diagnostics.push({ code: 'unknown', path: 'timeline.' + record.id, message: '协同攻击的时长或次数依赖尚未确定的队伍天赋等级。' });
        continue;
      }
      if (!sourceIds.has(record.id) || rule.window && (!cast || record.timeMs >= end || charges === 0) || record.timeMs < next) continue;
      if (record.timeMs < uncertainUntil) { unknownSources.add(record.id); continue; }
      if (!field.has(record.id)) field.set(record.id, actorIsOnField(runtime.team, runtime.context, { eventId: record.id, targetId: 'target', phase: 'before' }, record.actor));
      const active = field.get(record.id);
      if (active === false) continue;
      if (!attacks.has(record.id)) attacks.set(record.id, recordedAttackApplies(runtime, record));
      const applied = attacks.get(record.id);
      if (applied === false) continue;
      if (active === undefined || applied === undefined) {
        unknownSources.add(record.id);
        diagnostics.push({ code: 'unknown', path: 'timeline.' + record.id, message: hit.name + '缺少攻击是否命中或攻击者的站场事实。' });
        uncertainUntil = rule.window ? end : record.timeMs + rule.cooldownMs;
        continue;
      }
      const sources = [...cast ? [cast.id] : [], record.id];
      const matches = manual.filter(entry => !used.has(entry.id) && entry.timeMs === record.timeMs
        && (!entry.sourceEventIds?.length || entry.sourceEventIds.includes(record.id)));
      const match = matches[0];
      if (!match && size >= 10000) {
        diagnostics.push({ code: 'budget', path: 'timeline', message: '协同攻击超出项目事件上限。' });
        break;
      }
      const definition = project.definitions.find(entry => entry.id === owner + '-real-damage') ?? project.definitions.find(entry => entry.nodes.some(node => node.op === 'game-damage'));
      if (!match && !definition) {
        diagnostics.push({ code: 'unknown', path: 'timeline.' + record.id, message: hit.name + '缺少伤害记录定义。' });
        break;
      }
      const mode = record.coordinatedMode ?? cast?.coordinatedMode;
      const damage = match?.damage ? structuredClone(match.damage) : { hit: hitRef, crit: mode ? mode.crit : 'expected' as const, reaction: mode ? mode.reaction : null, facts: [] };
      const facts = damage.facts ??= [];
      if (!Object.hasOwn(subjectFacts(facts, { kind: 'event' }) ?? {}, rule.readyFact)) putHitFact(facts, { kind: 'event' }, rule.readyFact, activeFlag, 'derived');
      if (!Object.hasOwn(subjectFacts(facts, { kind: 'actor', id: record.actor }) ?? {}, 'onField')) {
        putHitFact(facts, { kind: 'actor', id: record.actor }, 'onField', activeFlag, 'derived');
      }
      let id = match?.id;
      if (id) used.add(id);
      else {
        do { id = 'derived-coordinated-' + ++sequence; } while (reserved.has(id));
        reserved.add(id); size++;
      }
      const projection: RecordEntry = { ...match, id, actor: owner, timeMs: record.timeMs, order: record.order, kind: 'damage',
        definition: match?.definition ?? definition!.id, sourceEventIds: [...new Set([...sources, ...match?.sourceEventIds ?? []])], damage };
      for (const duplicate of matches.slice(1)) { used.add(duplicate.id); duplicates.set(duplicate.id, id); }
      const following = after.get(record.id) ?? [];
      following.push(projection); after.set(record.id, following);
      next = record.timeMs + rule.cooldownMs;
      if (rule.window) charges--;
    }
    for (const entry of manual) {
      if (used.has(entry.id) || !entry.sourceEventIds?.some(id => sourceIds.has(id))) continue;
      const ready = entry.sourceEventIds.some(id => unknownSources.has(id)) ? null : false;
      excluded.set(entry.id, withTriggerFact(entry, rule.readyFact, ready));
    }
  }
  if (!after.size && !excluded.size) return { project, diagnostics };
  const times = new Set([...after.values()].flat().map(hit => hit.timeMs)), positions = new Map<number, number>();
  const timeline = records.filter(record => !used.has(record.id)).flatMap(record => [excluded.get(record.id) ?? record, ...after.get(record.id) ?? []]).map(record => {
    if (!times.has(record.timeMs)) return record;
    const index = positions.get(record.timeMs) ?? 0;
    positions.set(record.timeMs, index + 1);
    return { ...record, order: index };
  });
  const objective = duplicates.size && project.objective.damageIds ? { damageIds: [...new Set(project.objective.damageIds.map(id => duplicates.get(id) ?? id))] } : project.objective;
  return { project: { ...project, timeline, objective }, diagnostics };
}

/** Validate recorded successful procs using only explicitly linked attack times. */
function applyConfirmedHits(project: Project, byActor: ActorBuilds): { project: Project; diagnostics: Diagnostic[] } {
  type Item = { record: RecordEntry; fact: string; cooldown: number; source?: RecordEntry; hasSource: boolean };
  const records = new Map(project.timeline.map(record => [record.id, record]));
  const groups = new Map<string, Item[]>(), diagnostics: Diagnostic[] = [];
  const replacements = new Map<string, RecordEntry>();
  let prepared: ReturnType<typeof prepareProjectRuntime> | undefined;
  for (const record of project.timeline) {
    if (!record.damage || !['weapons','characters'].includes(record.damage.hit.definition.group)) continue;
    const build = byActor.get(record.actor);
    if (!build) continue;
    const selected = findBuildHit(build, record.damage.hit);
    const rule = selected?.hit && 'confirmedProc' in selected.hit ? selected.hit.confirmedProc : undefined;
    if (!rule) continue;
    const cooldown = rule.cooldownMs[build.refinement - 1];
    const flag = subjectFacts(record.damage.facts, { kind: 'event' })?.[rule.confirmedFact];
    if (flag?.value?.kind !== 'boolean' || flag.value.value !== true) continue;
    prepared ??= prepareProjectRuntime(project);
    if (!prepared.ok) return { project, diagnostics };
    const sourceIds = record.sourceEventIds ?? [];
    const source = sourceIds.length === 1 ? records.get(sourceIds[0]) : undefined;
    const sourceHit = source?.damage && findBuildHit(byActor.get(source.actor), source.damage.hit);
    const sourceFacts = source?.damage && subjectFacts(source.damage.facts, { kind: 'event' });
    const targetCount = sourceFacts?.targetsHit ?? source?.facts?.targetsHit;
    const damaged = sourceFacts?.targetsDamaged ?? source?.facts?.targetsDamaged;
    // A positive damage count proves contact even when the contact count is unknown.
    const hitConfirmed = !targetCount || (targetCount.value?.kind === 'quantity' ? targetCount.value.value > 0
      : damaged?.value?.kind === 'quantity' && damaged.value.value > 0 && damaged.provenance !== 'preset');
    const valid = source && source.actor === record.actor && (source.timeMs < record.timeMs
      || source.timeMs === record.timeMs && source.order < record.order)
      && source.damage?.hit.definition.group === 'characters' && sourceHit?.hit.category
      && rule.sourceCategories.includes(sourceHit.hit.category) && hitConfirmed && recordedAttackApplies(prepared.runtime, source) === true;
    const key = JSON.stringify([record.actor, record.damage.hit.definition.group, definitionKey(record.damage.hit.definition), rule.group]);
    const items = groups.get(key) ?? [];
    items.push({ record, fact: rule.confirmedFact, cooldown, hasSource: sourceIds.length > 0, ...(valid ? { source } : {}) });
    groups.set(key, items);
  }
  for (const items of groups.values()) {
    const uncertain = items.filter(item => !item.source);
    for (const item of uncertain) {
      if (item.hasSource) {
        replacements.set(item.record.id, withTriggerFact(item.record, item.fact, null));
      }
      diagnostics.push({ code: 'unknown', path: 'timeline.' + item.record.id,
        message: `已确认的${item.record.damage?.hit.definition.group === 'weapons' ? '装备' : '角色'}触发缺少唯一、有效且已命中的来源攻击，无法核对冷却。` });
    }
    const known = items.filter((item): item is Item & { source: RecordEntry } => !!item.source)
      .sort((a,b) => a.source.timeMs - b.source.timeMs || a.source.order - b.source.order || a.source.id.localeCompare(b.source.id));
    let last = -Infinity;
    for (const item of known) {
      // An unlinked successful impact can have originated at any earlier time.
      if (uncertain.some(other => other.record.timeMs >= item.source.timeMs - item.cooldown)) {
        replacements.set(item.record.id, withTriggerFact(item.record, item.fact, null));
        diagnostics.push({ code: 'unknown', path: 'timeline.' + item.record.id, message: '其他已确认触发的来源时刻未知，无法核对冷却。' });
        continue;
      }
      if (item.source.timeMs < last + item.cooldown) {
        replacements.set(item.record.id, withTriggerFact(item.record, item.fact, false));
        diagnostics.push({ code: 'unknown', path: 'timeline.' + item.record.id, message: '已确认的触发与前一次触发的冷却冲突。' });
      } else last = item.source.timeMs;
    }
  }
  return { project: replacements.size ? { ...project, timeline: project.timeline.map(record => replacements.get(record.id) ?? record) } : project, diagnostics };
}
