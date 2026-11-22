import { definitionKey, subjectFacts, talentParameterAt, type CalculationFact, type CombatChange, type Project } from '@leyline/schema';
import { expression } from '@leyline/schema/buffs';
import { actorIsOnField } from './build-context';
import { evaluateCombatBindings } from './context';
import { projectCombatEvents } from './combat-changes';
import { prepareProjectRuntime, readRuntimePanel, type ProjectRuntime } from './project';

type Entry = Project['timeline'][number];
type Heal = NonNullable<Entry['talentHeal']>;

function healingAt(runtime: ProjectRuntime, record: Entry, healing: Heal): Pick<CombatChange, 'status' | 'healing' | 'missing'> {
  const build = runtime.builds.get(record.actor);
  if (!build || definitionKey(healing.definition) !== definitionKey(build.character)) return { status: 'unknown', missing: ['配装角色及修订'] };
  const talent = build.character.talents.find(t => t.heals?.some(h => h.id === healing.healId));
  const heal = talent?.heals?.find(h => h.id === healing.healId);
  if (!talent || !heal) return { status: 'unknown', missing: ['治疗条目'] };
  const recipient = healing.recipientId;
  if ((heal.recipient === 'self' && recipient !== record.actor) || (heal.recipient === 'other' && recipient === record.actor)) return { status: 'excluded', healing: 0 };
  const missing: string[] = [];
  let count = 1;
  if (heal.count) {
    const recorded = subjectFacts(healing.facts, { kind: 'event' })?.[heal.count.fact]?.value;
    if (recorded?.kind === 'quantity' && recorded.unit === 'count' && Number.isSafeInteger(recorded.value) && recorded.value >= 0) {
      count = heal.count.cap === undefined ? recorded.value : Math.min(recorded.value, heal.count.cap);
      if (!count) return { status: 'excluded', healing: 0 };
    } else missing.push(heal.count.fact);
  }
  if (heal.recipient === 'on-field') {
    const field = actorIsOnField(runtime.team, runtime.context, { eventId: record.id, targetId: 'target', phase: 'before' }, recipient);
    if (field === false) return { status: 'excluded', healing: 0 };
    if (field === undefined) missing.push('受治疗队员是否站场');
  }
  if (heal.condition !== undefined) {
    const clause = expression(heal.condition, build.character.metadata.facts);
    const reading = evaluateCombatBindings(runtime.team.program, runtime.context, { applies: clause }, {
      ownerId: record.actor, recipientId: recipient, contributorId: null, targetId: 'target', eventId: record.id, phase: 'before',
      sourceEventId: record.sourceEventIds?.[0] ?? null, facts: {}, actorFacts: {}, factOverrides: [], applications: [], captures: {}, hit: null,
    });
    const applies = reading.outputs.applies;
    if (applies?.state === 'known' && applies.value.kind === 'boolean') {
      if (!applies.value.value) return { status: 'excluded', healing: 0 };
    } else missing.push(...(reading.diagnostics.length ? reading.diagnostics.map(d => d.message) : ['治疗生效条件']));
  }
  const rank = runtime.team.talentRank(build, talent.category);
  const parameter = (id: string) => talentParameterAt(talent, id, rank);
  const rate = parameter(heal.rate), flat = heal.flat ? parameter(heal.flat) : 0;
  const owner = readRuntimePanel(runtime, record.actor, record);
  const receiver = recipient === record.actor ? owner : readRuntimePanel(runtime, recipient, record);
  const basis = owner.stats[heal.stat], outgoing = owner.stats.healingBonus, incoming = receiver.attributes?.incomingHealingBonus;
  if (basis == null) missing.push(record.actor + '/' + heal.stat);
  if (outgoing == null) missing.push(record.actor + '/healingBonus');
  if (incoming == null) missing.push(recipient + '/incomingHealingBonus');
  if (rate === undefined || flat === undefined) missing.push(talent.id + '/parameters');
  if (missing.length) return { status: 'unknown', missing };
  const value = (basis! * rate! + flat!) * (1 + outgoing! + incoming!) * count;
  return Number.isFinite(value) && value >= 0 ? { status: 'applied', healing: value } : { status: 'unknown', missing: ['有限非负治疗量'] };
}

/** Expand the cast's own unambiguous recipients, reusing independently recorded applications. */
function castHeals(project: Project): Project {
  const actors = new Map(project.candidate.actors.map(actor => [actor.id, actor]));
  const casts = project.timeline.flatMap(record => {
    if (record.kind !== 'action') return [];
    const character = actors.get(record.actor)?.build?.character;
    const heals = character?.talents.find(t => t.id === record.skillId)?.heals?.filter(h => h.trigger === 'cast');
    return character && heals?.length ? [{ record, character, heals }] : [];
  });
  if (!casts.length) return project;
  const rejected = new Set(projectCombatEvents(project).filter(e => e.kind === 'action' && e.occurred === false).map(e => e.id));
  const offered = project.timeline.filter(e => e.talentHeal);
  const linked = new Map<string, string>(), reserved = new Set(project.timeline.map(e => e.id));
  const generated = new Map<string, Entry[]>();
  const duplicate = new Set<string>(), moved = new Set<string>();
  function append(cast: string, entry: Entry) {
    const list = generated.get(cast) ?? [];
    list.push(entry);
    generated.set(cast, list);
  }
  let sequence = 0;
  for (const { record, character, heals } of casts) {
    if (rejected.has(record.id)) continue;
    for (const heal of heals) {
      const recipients = heal.recipient === 'self' ? [record.actor] : [...actors.keys()];
      for (const recipientId of recipients) {
        const matches = offered.filter(e => e.actor === record.actor && e.talentHeal?.healId === heal.id
          && e.talentHeal.recipientId === recipientId && definitionKey(e.talentHeal.definition) === definitionKey(character)
          && (e.sourceEventIds?.length ? e.sourceEventIds.includes(record.id) : e.timeMs === record.timeMs));
        const match = matches.find(e => !linked.has(e.id));
        if (match) {
          linked.set(match.id, record.id);
          for (const candidate of matches) if (candidate.id !== match.id) duplicate.add(candidate.id);
          if (match.timeMs === record.timeMs && (match.order < record.order || match.order === record.order && match.id.localeCompare(record.id) < 0)) {
            moved.add(match.id);
            append(record.id, match);
          }
          continue;
        }
        let id: string;
        do { id = 'derived-cast-heal-' + ++sequence; } while (reserved.has(id));
        reserved.add(id);
        append(record.id, { id, timeMs: record.timeMs, order: record.order, kind: 'state-change', actor: record.actor,
          definition: actors.get(record.actor)!.character, sourceEventIds: [record.id], talentHeal: {
            definition: { namespace: character.namespace, id: character.id, revision: character.revision }, healId: heal.id, recipientId } });
      }
    }
  }
  for (const entry of offered) if (entry.sourceEventIds?.some(id => rejected.has(id))) duplicate.add(entry.id);
  if (!generated.size && !linked.size && !duplicate.size) return project;
  const timeline = project.timeline.filter(entry => !moved.has(entry.id)).sort((a,b) => a.timeMs - b.timeMs || a.order - b.order || a.id.localeCompare(b.id))
    .flatMap(entry => [entry, ...(generated.get(entry.id) ?? [])]).map((entry, order) => ({ ...entry, order,
      ...(duplicate.has(entry.id) && !linked.has(entry.id) ? { talentHeal: undefined } : {}),
      ...(linked.has(entry.id) && !entry.sourceEventIds?.length ? { sourceEventIds: [linked.get(entry.id)!] } : {}) }));
  return { ...project, timeline };
}

/** Resolve each recipient once. Derived healing events belong only to this run. */
export function resolveTalentHealing(input: Project): { project: Project; changes: CombatChange[] } {
  const project = castHeals(input);
  const changes: CombatChange[] = [];
  if (!project.timeline.some(record => record.talentHeal)) return { project, changes };
  const used = new Set(project.timeline.map(record => record.id));
  const orders = new Map([...new Set(project.timeline.map(record => record.order))].sort((a, b) => a - b).map((order, i) => [order, i * 2]));
  const received = new Map<string, Entry>();
  let sequence = 0;
  const timeline = project.timeline.flatMap(original => {
    const record = { ...original, order: orders.get(original.order)! };
    if (!record.talentHeal || record.actor === record.talentHeal.recipientId) return [record];
    let id: string;
    do { id = 'derived-received-' + ++sequence; } while (used.has(id));
    used.add(id);
    const counterpart: Entry = { id, timeMs: record.timeMs, order: record.order + 1, kind: 'state-change',
      actor: record.talentHeal.recipientId, definition: project.candidate.actors.find(a => a.id === record.talentHeal!.recipientId)!.character,
      sourceEventIds: [record.id] };
    received.set(record.id, counterpart);
    return [record, counterpart];
  });
  const output = { ...project, timeline };
  const prepared = prepareProjectRuntime(output);
  const events = new Map(prepared.ok ? prepared.runtime.context.events.map(event => [event.id, event] as const) : []);
  function assign(record: Entry, key: string, value: CalculationFact) {
    record.facts = { ...record.facts, [key]: value };
    const event = events.get(record.id);
    if (event) event.facts[key] = value;
  }
  const selected = timeline.filter(record => record.talentHeal).sort((a, b) => a.timeMs - b.timeMs || a.order - b.order || a.id.localeCompare(b.id));
  for (const record of selected) {
    const healing = record.talentHeal!;
    const reading = prepared.ok ? healingAt(prepared.runtime, record, healing) : { status: 'unknown' as const, missing: prepared.issues.map(issue => issue.message) };
    changes.push({ source: record.id, ...(record.sourceEventIds?.length ? { sourceEventIds: record.sourceEventIds } : {}),
      actor: record.actor, effect: healing.healId, recipient: healing.recipientId, timeMs: record.timeMs, kind: 'talent-healing', ...reading });
    if (reading.status === 'excluded') continue;
    const value: CalculationFact = { provenance: 'derived', sourceRefs: [], value: reading.healing === undefined ? null : { kind: 'quantity', unit: 'hp', value: reading.healing } };
    assign(record, 'healingDone', value);
    assign(received.get(record.id) ?? record, 'healingReceived', value);
  }
  return { project: output, changes };
}
