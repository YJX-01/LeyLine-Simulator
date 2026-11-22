import { definitionKey, equipmentHits, subjectFacts, type CalculationFact, type HitRef, type Project } from '@leyline/schema';

type Entry = Project['timeline'][number];
type Window = { owner: string; hit: HitRef; start: Entry; until: number; fact: string; sum: number | null; sources: string[] };

/** Build transient damage records from recorded healing, preserving any matching authored impact. */
export function accumulateHealingHits(project: Project): Project {
  const heals = project.timeline.filter(record => record.kind === 'state-change' && record.facts?.healingDone);
  if (!heals.length) return project;
  const rules = project.candidate.actors.flatMap(actor => actor.build ? equipmentHits(actor.build)
    .flatMap(entry => entry.hit.accumulate ? [{ owner: actor.id, hit: entry.ref, rule: entry.hit.accumulate }] : []) : []);
  if (!rules.length) return project;
  const timeline = [...project.timeline], windows: Window[] = [], active = new Map<string, Window>(), ready = new Map<string, number>();
  for (const record of heals.sort((a, b) => a.timeMs - b.timeMs || a.order - b.order || a.id.localeCompare(b.id))) {
    for (const { owner, hit, rule } of rules) {
      const change = record.facts?.[rule.eventFact];
      if (owner !== record.actor || !change) continue;
      const hitKey = JSON.stringify([definitionKey(hit.definition), hit.hitId]);
      let window = active.get(hitKey);
      if (!window || record.timeMs >= window.until) {
        const cooldownKey = JSON.stringify([hitKey, owner]);
        if (record.timeMs < (ready.get(cooldownKey) ?? 0)) continue;
        window = { owner, hit, start: record, until: record.timeMs + rule.durationMs, fact: rule.hitFact, sum: 0, sources: [] };
        ready.set(cooldownKey, record.timeMs + rule.cooldownMs);
        active.set(hitKey, window);
        windows.push(window);
      }
      if (window.owner !== owner) continue;
      const amount = change.value;
      if (window.sum !== null && amount?.kind === 'quantity' && amount.unit === 'hp' && amount.value >= 0) window.sum += amount.value;
      else window.sum = null;
      window.sources.push(record.id);
    }
  }
  const reserved = new Set(timeline.map(record => record.id));
  let sequence = 0;
  for (const window of windows) {
    if (window.until > 3600000) continue;
    const value: CalculationFact = { value: window.sum === null ? null : { kind: 'quantity', unit: 'hp', value: window.sum }, provenance: 'derived', sourceRefs: [] };
    const existing = timeline.findIndex(entry => entry.actor === window.owner && entry.damage?.hit.hitId === window.hit.hitId
      && definitionKey(entry.damage.hit.definition) === definitionKey(window.hit.definition)
      && (entry.sourceEventIds?.includes(window.start.id) || entry.timeMs === window.until));
    if (existing >= 0) {
      const entry = timeline[existing], damage = entry.damage!;
      const fields = subjectFacts(damage.facts, { kind: 'event' });
      if (!fields || !Object.hasOwn(fields, window.fact)) timeline[existing] = { ...entry, damage: { ...damage, facts: [
        ...damage.facts?.filter(row => row.subject.kind !== 'event') ?? [], { subject: { kind: 'event' }, values: { ...fields, [window.fact]: value } }] } };
      continue;
    }
    const definition = project.definitions.find(entry => entry.id === window.owner + '-real-damage') ?? project.definitions.find(entry => entry.nodes.some(node => node.op === 'game-damage'));
    if (!definition) continue;
    let id;
    do { id = 'derived-healing-' + ++sequence; } while (reserved.has(id));
    reserved.add(id);
    timeline.push({ id, actor: window.owner, timeMs: window.until, order: window.start.order, kind: 'damage', definition: definition.id,
      sourceEventIds: window.sources, damage: { hit: window.hit, crit: 'noncritical', reaction: 'none',
        facts: [{ subject: { kind: 'event' }, values: { [window.fact]: value } }] } });
  }
  return { ...project, timeline };
}
