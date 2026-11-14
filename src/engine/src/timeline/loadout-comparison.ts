import { loadoutCandidatesSchema, projectSchema, type Build, type LoadoutCandidate, type LoadoutComparison, type Project } from '@leyline/schema';
import { evaluateTimeline } from './index';

/** Rebuild every candidate's entire dependency graph, preserving the original records and account. */
export function compareTimelineLoadouts(input: Project, candidates: LoadoutCandidate[]): LoadoutComparison {
  const project = projectSchema.parse(input);
  const entries = loadoutCandidatesSchema.parse(candidates);
  const baseline = evaluateTimeline(project);
  const originalSources = new Set((baseline.effectInstances ?? []).map(instance => instance.id));
  const delta = (before: number | null, after: number | null) => before === null || after === null ? null : after - before;
  return { baseline, candidates: entries.map(candidate => {
    const next = projectSchema.parse(project);
    const builds: LoadoutComparison['candidates'][number]['sources']['builds'] = [];
    for (const replacement of candidate.replacements) {
      const actor = next.candidate.actors.find(actor => actor.id === replacement.actorId);
      if (!actor?.build || actor.build.character.id !== replacement.build.character.id) throw new Error('候选须替换轴内同一角色的完整配装快照。');
      const before = actor.build;
      const fields = (Object.keys(replacement.build) as (keyof Build)[]).filter(key => JSON.stringify(before[key]) !== JSON.stringify(replacement.build[key]));
      if (fields.length) builds.push({ actorId: actor.id, fields });
      actor.build = replacement.build;
      delete actor.accountSnapshot;
      for (const slot of ['character', 'weapon'] as const) {
        const definition = next.definitions.find(definition => definition.id === actor[slot]);
        if (definition) {
          const entity = replacement.build[slot];
          definition.version = replacement.build.dataVersion;
          definition.source = { kind: 'user', reference: `${entity.id}@${replacement.build.dataVersion}`, verified: false };
          definition.name = `${slot === 'character' ? replacement.build.character.identity.name : replacement.build.weapon.name} · 候选快照`;
        }
      }
      const damageDefinitions = new Set(next.timeline.filter(record => record.actor === actor.id && record.kind === 'damage').map(record => record.definition));
      for (const definition of next.definitions) if (damageDefinitions.has(definition.id) && definition.nodes.some(node => node.op === 'game-damage')) {
        definition.version = replacement.build.dataVersion;
        definition.source = { kind: 'user', reference: `${replacement.build.character.id}@${replacement.build.character.revision}`, verified: false };
      }
    }
    // Revisions/applications keep their identities. Changed sources remain stale, never silently rebound.
    const result = evaluateTimeline(projectSchema.parse(next));
    const sources = new Set((result.effectInstances ?? []).map(instance => instance.id));
    return { id: candidate.id, ...(candidate.name ? { name: candidate.name } : {}), result,
      delta: delta(baseline.objectiveValue, result.objectiveValue),
      points: baseline.points.map(before => {
        const after = result.points.find(point => point.id === before.id)?.value ?? null;
        return { id: before.id, before: before.value, after, delta: delta(before.value, after) };
      }),
      sources: { added: [...sources].filter(id => !originalSources.has(id)), removed: [...originalSources].filter(id => !sources.has(id)), builds } };
  }) };
}
