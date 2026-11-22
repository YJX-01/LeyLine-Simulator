import { combatDamageBindings } from '@leyline/schema/hit-bindings';
import { isTransformative } from '@leyline/schema';
import type { BoundAggregateRequest, CalculationFact, CombatFrame, DamageOccurrence, ProjectReaction, Value } from '@leyline/schema';

const ref = (id: string) => ({ namespace: 'builtin' as const, id, revision: '1' });
const fact = (value: Value | null): CalculationFact => ({ value, provenance: 'explicit', sourceRefs: [] });
const critical = { kind: 'enum' as const, value: 'critical' };
const noncritical = { kind: 'enum' as const, value: 'noncritical' };

export function reactionOccurrence(eventId: string, reaction: ProjectReaction, frameFor: (actorId: string) => CombatFrame): DamageOccurrence {
  const { family, element } = reaction;
  const { attr, call, critFactor, resistanceFactor } = combatDamageBindings(element);
  if (isTransformative(family)) {
    const owner = reaction.contributors[0], frame = frameFor(owner.actorId);
    const hit = { skillId: null, hitId: null, category: null, family: 'transformative', element, origin: 'reaction' as const, reactionId: family };
    return { eventId, outputId: family, actorId: owner.actorId, contributorIds: [owner.actorId], family: 'transformative',
      computation: { kind: 'formula', invocation: { formula: ref('transformative'), output: 'value', captures: [], bindings: {
        levelMultiplier: call('reaction-level-multiplier', { level: attr('level') }), em: attr('elementalMastery'), resistanceFactor,
        reactionBonus: attr('reaction.transformative.damageBonus'), reactionCoefficient: attr('reaction.' + family + '.coefficient'),
      } }, frame: { ...frame, hit, contributorId: owner.actorId, factOverrides: [...frame.factOverrides.filter(r => r.subject.kind !== 'actor' || r.subject.id !== owner.actorId),
        { subject: { kind: 'actor', id: owner.actorId }, facts: { ...frame.factOverrides.find(r => r.subject.kind === 'actor' && r.subject.id === owner.actorId)?.facts, ...owner.facts } }] } } };
  }
  const stellar = family === 'stellar-swirl';
  const special = (key: string) => attr('reaction.' + (stellar ? 'stellar-swirl.' : 'lunar.') + key);
  const expected = reaction.contributors.filter(contributor => contributor.crit === 'expected');
  const probability: BoundAggregateRequest['probability'] = reaction.jointCrit ? { kind: 'joint',
    states: reaction.jointCrit.map(state => ({ id: state.id, probability: state.probability, bindings: expected.map(({ actorId }) => ({
      contributorId: actorId, fact: 'critMode', value: state.critical[actorId] ? critical : noncritical,
    })) })),
  } : expected.length ? { kind: 'independent', variables: expected.map(({ actorId }) => ({ id: actorId,
    probability: { kind: 'crit-rate', contributorId: actorId, binding: attr('critRate') },
    bindings: [{ contributorId: actorId, fact: 'critMode', yes: critical, no: noncritical }],
  })) } : { kind: 'fixed' };
  const contributors = reaction.contributors.map(({ actorId, qualified, crit, facts }): BoundAggregateRequest['contributors'][number] => {
    const frame = frameFor(actorId);
    return { id: actorId, qualified, invocation: { formula: ref(family + '-individual'), output: 'value', captures: [], bindings: {
      levelMultiplier: call('reaction-level-multiplier', { level: attr('level') }), em: attr('elementalMastery'), critFactor, resistanceFactor,
      reactionBaseBonus: special('baseBonus'), reactionBonus: special('damageBonus'), flatBaseBonus: special('flatBaseBonus'),
      elevationFactor: stellar ? call('stellar-elevation-factor', { input: special('elevation') }) : special('elevationFactor'),
      ...(stellar ? { reactionCoefficient: { kind: 'fact' as const, scope: 'query' as const, key: 'reactionCoefficient', type: { kind: 'quantity' as const, unit: 'scalar' as const } } } : {}),
    } }, frame: { ...frame, contributorId: actorId,
      factOverrides: [...frame.factOverrides.filter(entry => entry.subject.kind !== 'actor' || entry.subject.id !== actorId),
        { subject: { kind: 'actor', id: actorId }, facts: { ...frame.factOverrides.find(entry => entry.subject.kind === 'actor' && entry.subject.id === actorId)?.facts, ...facts } }],
      facts: { ...facts, critMode: fact(crit === null ? null : { kind: 'enum', value: crit }),
        ...(stellar ? { reactionCoefficient: fact(reaction.coefficient == null ? null : { kind: 'quantity', unit: 'scalar', value: reaction.coefficient }) } : {}) },
      hit: { skillId: null, hitId: null, category: null, family, element, origin: 'reaction', reactionId: family },
    } };
  });
  return { eventId, outputId: family, actorId: null, contributorIds: contributors.map(contributor => contributor.id), family,
    computation: { kind: 'bound-aggregate', request: { definition: ref(family), contributors, probability } } };
}
