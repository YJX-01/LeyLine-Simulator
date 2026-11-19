import type { Build, CharacterDefinition, CombatActor, CombatContext, DamageRequest, DamageScalingStat, FormulaEvaluation, Value } from '@leyline/schema';
import { compileStructuredCharacter, evaluateBoundFormula } from '@leyline/engine';

export function selectCatalogHit(build: Pick<Build, 'character'>, skillId: string, index: number): Pick<DamageRequest, 'skillId' | 'hitId' | 'outputId'> {
  const hit = build.character.talents.find(skill => skill.id === skillId)?.hits[index];
  return { skillId, hitId: hit?.id ?? 'missing-hit', outputId: hit?.outputs[0]?.id ?? 'unavailable-output' };
}

/** Isolate a declared base binding using independent values from the catalog sources. */
export function evaluateCatalogBase(character: CharacterDefinition, talentId: string, hitIndex: number, level: number,
  read: (stat: DamageScalingStat) => number | null, inputs: Record<string, number | null> = {}): FormulaEvaluation {
  const compiled = compileStructuredCharacter(character);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const talent = character.talents.find(talent => talent.id === talentId)!, hit = talent.hits[hitIndex];
  const fact = (value: Value | null) => ({ value, provenance: 'explicit' as const, sourceRefs: [] });
  const numeric = (unit: 'scalar' | 'count' | DamageScalingStat, value: number | null) => fact(value === null ? null : { kind: 'quantity', unit, value });
  const actor: CombatActor = { id: character.id, ascension: 0, constellation: 0, refinement: 1, effects: [], setCounts: {}, facts: {}, actorFacts: {},
    identity: { element: character.identity.element, sourceRefs: character.sources },
    talents: character.talents.map(talent => ({ id: talent.id, level, sourceRefs: talent.sources, parameters: talent.parameters.map(parameter => ({
      id: parameter.id, type: parameter.unit === 'ratio' || parameter.unit === 'scalar' ? { kind: 'quantity', unit: 'scalar' } : null,
      values: parameter.values.map(value => parameter.unit === 'ratio' || parameter.unit === 'scalar' ? { kind: 'quantity', unit: 'scalar', value } : null),
    })) })),
    inputs: { whiteHp: numeric('hp', read('hp')), whiteAttack: numeric('attack', read('attack')), whiteDefense: numeric('defense', read('defense')),
      hpPercent: numeric('scalar', 0), attackPercent: numeric('scalar', 0), defensePercent: numeric('scalar', 0),
      flatHp: numeric('hp', 0), flatAttack: numeric('attack', 0), flatDefense: numeric('defense', 0), elementalMastery: numeric('elementalMastery', read('elementalMastery')) } };
  const context: CombatContext = { actors: [actor], targets: [{ id: 'target', inputs: {}, facts: {} }], team: { inputs: {}, facts: {}, actorFacts: {} }, sources: [], factIntervals: [],
    events: [{ id: 'hit', kind: 'hit', actorId: actor.id, targetIds: ['target'], timeMs: 1, order: 1, skillId: talentId, hitId: hit.id, category: hit.category, sourceEventIds: [], facts: {} }] };
  const captures = Object.fromEntries(hit.base.captures.map(slot => {
    const id = `capture-${slot.id}`;
    context.events.unshift({ id, kind: 'capture', actorId: actor.id, targetIds: [], timeMs: 0, order: 0, skillId: slot.sourceSkillId, sourceEventIds: [], facts: {} });
    return [slot.id, { eventId: id, phase: slot.allowedPhases[0] }];
  }));
  const facts = Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, numeric(talent.inputs?.find(input => input.id === key)?.type.unit === 'count' ? 'count' : 'scalar', value)]));
  return evaluateBoundFormula(compiled.program, context, hit.base, { ownerId: actor.id, recipientId: actor.id, contributorId: null, targetId: 'target',
    eventId: 'hit', sourceEventId: null, phase: 'before', facts, actorFacts: {}, captures, applications: [], factOverrides: [],
    hit: { skillId: talentId, hitId: hit.id, category: hit.category, element: hit.element, family: 'ordinary', origin: 'talent', reactionId: null } });
}

export function catalogBaseValue(result: FormulaEvaluation): number | null {
  const value = Object.values(result.outputs)[0];
  return value?.state === 'known' && value.value.kind === 'quantity' ? value.value.value : null;
}
