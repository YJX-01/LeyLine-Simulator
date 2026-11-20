import { canTryOrdinaryHit, ordinaryHitInvocation } from '@leyline/schema/hit-bindings';

/** Link current authored content against an explicitly supplied library. */
export function createContentLinker({ schemas, collectCalculationRoots, library }) {
  const referenceKey = reference => schemas.definitionKey(reference);
  const bindingRoots = (binding, roots) => {
    if (binding.kind === 'attribute' || binding.kind === 'enemy') roots.push(binding.key);
    if (binding.kind === 'formula') { roots.push(binding.formula); Object.values(binding.inputs).forEach(value => bindingRoots(value, roots)); }
  };
  function link(input, schema, kind) {
    const entity = schema.parse(input), roots = [], sourceIds = new Set(entity.sources), families = new Set(entity.calculation.bundle.damageFamilies ?? []);
    for (const collection of ['tables', 'formulas', 'attributes', 'effects', 'stateMachines', 'aggregates', 'coverage']) {
      roots.push(...entity.calculation.bundle[collection].map(definition => definition.identity));
    }
    entity.calculation.bundle.sources.forEach(source => sourceIds.add(source.id));
    roots.push(...entity.calculation.ruleIds);
    if (kind === 'character') {
      roots.push(...Object.values(entity.attributes.outputs), ...entity.calculation.contextCoverageRefs,
        ...entity.passives.flatMap(passive => passive.ruleIds), ...entity.constellations.flatMap(constellation => constellation.ruleIds));
      for (const talent of entity.talents) {
        talent.sources.forEach(source => sourceIds.add(source));
        for (const hit of talent.hits) {
          hit.sources.forEach(source => sourceIds.add(source)); roots.push(...hit.coverageRefs);
          for (const output of hit.outputs) { roots.push(...output.coverageRefs); families.add(output.family); }
          const invocations = [hit.base, ...hit.outputs.map(output => output.invocation)];
          if (canTryOrdinaryHit(talent, hit)) {
            families.add('ordinary');
            invocations.push(ordinaryHitInvocation(hit));
          }
          for (const invocation of invocations) {
            roots.push(invocation.formula, ...invocation.captures.flatMap(capture => capture.attributes));
            Object.values(invocation.bindings).forEach(binding => bindingRoots(binding, roots));
            if (invocation.predicate) bindingRoots(invocation.predicate, roots);
          }
        }
      }
    } else if (kind === 'weapon') roots.push(...entity.coverageRefs);
    else for (const effect of entity.effects) roots.push(...effect.ruleIds, ...effect.coverageRefs);
    const unique = [...new Map(roots.map(reference => [referenceKey(reference), reference])).values()];
    const result = collectCalculationRoots(library, { roots: unique, sourceIds: [...sourceIds], families: [...families] });
    if (!result.ok) throw new Error(entity.id + ': ' + JSON.stringify(result.diagnostics));
    return schema.parse({ ...entity, calculation: { ...entity.calculation, bundle: result.bundle } });
  }
  return {
    character: input => link(input, schemas.structuredCharacterDefinitionSchema, 'character'),
    weapon: input => link(input, schemas.structuredWeaponDefinitionSchema, 'weapon'),
    set: input => link(input, schemas.structuredArtifactSetDefinitionSchema, 'set'),
  };
}
