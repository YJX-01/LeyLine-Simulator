import { characterHitRef, hitBelongsToCharacter, findBuildHit, putHitFact, subjectFacts, talentLevelBonus, type Diagnostic, type Project } from '@leyline/schema';
import { authoredHitEntries } from '@leyline/schema/hit-bindings';
import { actorIsOnField } from './build-context';
import { prepareProjectRuntime, recordedAttackApplies } from './project';
import { resolveCombatChanges } from './combat-changes';

type RecordEntry = Project['timeline'][number];
const activeFlag = { kind: 'boolean' as const, value: true };

/** A projection uses its own cooldown, cast charges and source. Its damage belongs to the on-field attacker. */
export function resolveCoordinatedHits(project: Project): { project: Project; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const rules = project.candidate.actors.flatMap(({ id: owner, build }) => !build ? [] : build.character.talents.flatMap(talent =>
    talent.hits.filter(hit => hit.coordinated).flatMap(hit => {
      const unlock = authoredHitEntries(build.character.metadata, talent.id).find(entry => entry.hit.id === hit.id)?.unlock;
      return unlock && build[unlock.state] < unlock.rank ? [] : [{ owner, build, talent, hit, rule: hit.coordinated! }];
    })));
  const byActor = new Map(project.candidate.actors.map(actor => [actor.id, actor.build]));
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
    const level = build.talents[talent.category] + talentLevelBonus(build.character, talent.category, build.constellation);
    const param = (id: string) => talent.parameters.find(p => p.id === id)!.values[level - 1];
    let cast: RecordEntry | undefined, end = 0, charges = 0, next = 0, uncertainUntil = 0;
    for (const record of records) {
      if (rule.window && record.kind === 'action' && record.actor === owner && record.skillId === talent.id && !rejected.has(record.id)) {
        cast = record;
        end = record.timeMs + param(rule.window.duration) * 1000;
        charges = param(rule.window.charges);
        uncertainUntil = 0;
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
      const damage = structuredClone(entry.damage!);
      const ready = entry.sourceEventIds.some(id => unknownSources.has(id)) ? null : { kind: 'boolean' as const, value: false };
      putHitFact(damage.facts ??= [], { kind: 'event' }, rule.readyFact, ready, 'derived');
      excluded.set(entry.id, { ...entry, damage });
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
