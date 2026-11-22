import { actorConditions, combatStateFields, createFieldPresenceReader, type CombatConditions, type CombatStateField, type CombatStateInterval, type CombatStateRead, type Project } from '@leyline/schema';

type RecordEntry = Pick<Project['timeline'][number], 'actor' | 'id' | 'timeMs' | 'kind' | 'damage'> & { order?: number };

/** Build a per-run index. All intervals and overrides must already pass projectSchema. */
export function createCombatStateReader(project: Project) {
  const presence = createFieldPresenceReader(project);
  const fields = new Map<string, CombatStateInterval[]>();
  for (const interval of project.combatStates ?? []) {
    for (const field of combatStateFields) {
      if (interval.values[field] === undefined) continue;
      const key = JSON.stringify([interval.actor, field]);
      const entries = fields.get(key) ?? [];
      entries.push(interval);
      fields.set(key, entries);
    }
  }
  for (const entries of fields.values()) entries.sort((a, b) => a.startMs - b.startMs);
  const cache = new Map<string, { conditions: CombatConditions; reads: CombatStateRead[] }>();
  return (actor: string, record: RecordEntry) => {
    const key = JSON.stringify([actor, record.id]);
    const cached = cache.get(key);
    if (cached) return cached;
    const conditions: CombatConditions = {};
    const reads: CombatStateRead[] = [];
    function readField<F extends CombatStateField>(field: F) {
      const entries = fields.get(JSON.stringify([actor, field])) ?? [];
      let left = 0;
      let right = entries.length;
      while (left < right) {
        const middle = (left + right) >>> 1;
        if (entries[middle].startMs <= record.timeMs) left = middle + 1;
        else right = middle;
      }
      const candidate = entries[left - 1];
      const interval = candidate && record.timeMs < candidate.endMs ? candidate : undefined;
      const override = record.kind === 'damage' ? actorConditions(record.damage?.facts, actor)[field] : undefined;
      if (field === 'onField') {
        const state = presence(actor,record.timeMs,record.order);
        const value = override !== undefined ? override as boolean | null : state?.value;
        if (value !== undefined) conditions.onField = value;
        reads.push({actor,field,timeMs:record.timeMs,recordId:record.id,value:value ?? null,source:override!==undefined?'override':state?.source ?? 'unknown',
          intervalId:state?.source==='interval'?state.id:null,...state?.source==='switch'?{sourceEventId:state.id}:{}});
        return;
      }
      const value = override !== undefined ? override : interval?.values[field];
      if (value !== undefined) conditions[field] = value;
      reads.push({ actor, field, timeMs: record.timeMs, recordId: record.id, value: value ?? null,
        source: override !== undefined ? 'override' : interval ? 'interval' : 'unknown', intervalId: interval?.id ?? null });
    }
    for (const field of combatStateFields) readField(field);
    const result = { conditions, reads };
    cache.set(key, result);
    return result;
  };
}
