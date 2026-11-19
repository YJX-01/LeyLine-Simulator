const collections = ['sources', 'tables', 'formulas', 'attributes', 'effects', 'stateMachines', 'aggregates', 'coverage'];
const key = reference => JSON.stringify([reference.namespace, reference.id, reference.revision]);

/** Assemble the explicit authored owners. Duplicate ownership is an error even for equal bytes. */
export function assembleCalculationLibrary(common, reactions, entities) {
  const bundles = [common, reactions.calculation, ...entities.flatMap(entity => entity.calculation ? [entity.calculation.bundle] : [])];
  const result = { schemaVersion: 2, runtimeVersion: 2, requiredFeatures: [], damageFamilies: [] };
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

/** Read the same maintained inputs for independent numeric checks, without generated snapshots. */
export function readCalculationLibrary(read) {
  const base = 'src/game-data/data';
  const manifest = read(`${base}/manifest.json`);
  const entities = [['characters', manifest.characters], ['weapons', manifest.weapons], ['artifact-sets', manifest.sets], ['actions', manifest.actions]]
    .flatMap(([folder, ids]) => ids.map(id => read(`${base}/${folder}/${id}.json`)));
  return assembleCalculationLibrary(read(`${base}/calculation/common.json`), read(`${base}/calculation/reactions.json`), entities);
}
