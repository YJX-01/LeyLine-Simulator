import { APP_VERSION } from '@leyline/schema/version';
const collections = ['sources', 'tables', 'formulas', 'attributes', 'effects', 'stateMachines', 'aggregates', 'coverage'];
const key = reference => JSON.stringify([reference.namespace, reference.id, reference.revision]);

/** Assemble the explicit authored owners. Duplicate ownership is an error even for equal bytes. */
export function assembleCalculationLibrary(common, reactions, entities) {
  const bundles = [common, reactions.calculation, ...entities.flatMap(entity => entity.calculation ? [entity.calculation.bundle] : [])];
  const result = { schemaVersion: APP_VERSION, runtimeVersion: APP_VERSION, requiredFeatures: [], damageFamilies: [] };
  for (const field of ['requiredFeatures', 'damageFamilies']) result[field] = [...new Set(bundles.flatMap(bundle => bundle[field] ?? []))];
  for (const field of collections) {
    const seen = new Set();
    result[field] = bundles.flatMap(bundle => bundle[field]).map(definition => {
      const identity = field === 'sources' ? definition.id : key(definition.identity);
      if (seen.has(identity)) throw new Error(`Duplicate authored ${field} ownership: ${identity}`);
      seen.add(identity);
      return structuredClone(definition);
    });
  }
  // The typed lookup and the ordinary evaluator share one authored level table.
  const identity = { namespace: 'builtin', id: 'reaction-level', revision: reactions.rules.revision };
  if (result.tables.some(table => key(table.identity) === key(identity))) throw new Error('reaction-level must derive from reactions.rules.levelMultipliers');
  result.tables.push({ kind: 'integer', identity, start: 0, valueType: { kind: 'quantity', unit: 'damage' },
    values: reactions.rules.levelMultipliers.map(value => value === null ? null : { kind: 'quantity', unit: 'damage', value }), sources: ['kqm.reaction-levels'] });
  return result;
}
