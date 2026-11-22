import { hitInvocations } from '@leyline/schema/hit-bindings';
import { expression } from '@leyline/schema/buffs';
/** Link current authored content against an explicitly supplied library. */
export function createContentLinker({ schemas, collectCalculationRoots, library }) {
  const referenceKey = reference => schemas.definitionKey(reference);
  const bindingRoots = (binding, roots) => {
    if (binding.kind === 'attribute' || binding.kind === 'enemy' || binding.kind === 'team-attribute') roots.push(binding.key);
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
      if (entity.talents.some(talent => talent.heals?.length)) roots.push({ namespace: 'builtin', id: 'attribute.incomingHealingBonus', revision: '1' });
      roots.push({ namespace: 'builtin', id: 'attribute.shieldStrength', revision: '1' }, ...(entity.calculation.resonances ?? []).flatMap(rule => rule.ruleIds));
      roots.push(...entity.calculation.gleam?.ruleIds ?? []);
      for (const id of ['attribute.reaction.transformative.damageBonus','attribute.reaction.stellar-swirl.damageBonus','attribute.reaction.lunar.damageBonus',
        'scene.autumn-platform.pyro','scene.autumn-platform.cryo',
        ...['sprint','glide','swim','climb'].map(mode=>'attribute.staminaCostReduction.'+mode)]) roots.push({ namespace: 'builtin', id, revision: '1' });
      if (entity.talents.some(t => t.cooldownParameter)) roots.push({ namespace: 'builtin', id: 'attribute.skillCooldownReduction', revision: '1' });
      roots.push(...Object.values(entity.attributes.outputs), ...entity.calculation.contextCoverageRefs,
        ...entity.passives.flatMap(passive => passive.ruleIds), ...entity.constellations.flatMap(constellation => constellation.ruleIds));
      for (const talent of entity.talents) {
        roots.push(...talent.ruleIds);
        for (const heal of talent.heals ?? []) if (heal.condition !== undefined) bindingRoots(expression(heal.condition, entity.metadata.facts), roots);
        talent.sources.forEach(source => sourceIds.add(source));
        for (const hit of talent.hits) {
          hit.sources.forEach(source => sourceIds.add(source)); roots.push(...hit.coverageRefs);
          Object.keys(hit.damage).forEach(family => families.add(family));
          const invocations = hitInvocations(hit);
          for (const invocation of invocations) {
            roots.push(invocation.formula, ...invocation.captures.flatMap(capture => capture.attributes));
            Object.values(invocation.bindings).forEach(binding => bindingRoots(binding, roots));
            if (invocation.predicate) bindingRoots(invocation.predicate, roots);
          }
        }
      }
    } else {
      const owners = kind === 'weapon' ? [entity] : entity.effects;
      for (const owner of owners) {
        roots.push(...owner.ruleIds ?? [], ...owner.coverageRefs);
        for (const hit of owner.hits ?? []) for (const invocation of hitInvocations(hit)) {
          roots.push(invocation.formula);
          Object.values(invocation.bindings).forEach(binding => bindingRoots(binding, roots));
          if (invocation.predicate) bindingRoots(invocation.predicate, roots);
        }
      }
    }
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
