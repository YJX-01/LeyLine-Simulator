import { authoredHit } from '../../src/schema/src/calculation/hit-bindings.mjs';
/** Explicit current hit bindings and owned effects; no retired support flags. */
export function damagePathAudit(manifest, characters) {
  const entities = characters.map(character => ({ id: character.id, name: character.identity.name, revision: character.revision,
    talents: character.talents.map(talent => ({ id: talent.id, category: talent.category, inputs: talent.inputs ?? [], hits: talent.hits.map(hit => ({ id: hit.id, base: authoredHit(character.metadata, talent.id, hit.id).base, category: hit.category, element: hit.element, families: Object.keys(hit.damage), captures: hit.base.captures })) })),
    passives: character.passives.map(passive => ({ id: passive.id, rules: passive.ruleIds })), constellations: character.constellations.map(item => ({ rank: item.rank, rules: item.ruleIds })) }));
  const talents = entities.flatMap(entity => entity.talents);
  return { formatVersion: 2, dataVersion: manifest.dataVersion, meaning: 'Current stable bindings, not full content or observed damage.', entities,
    summary: { entities: entities.length, talents: talents.length, hits: talents.reduce((sum, talent) => sum + talent.hits.length, 0), boundHits: talents.reduce((sum, talent) => sum + talent.hits.filter(hit => hit.families.length).length, 0), outputs: talents.reduce((sum, talent) => sum + talent.hits.reduce((total, hit) => total + hit.families.length, 0), 0) } };
}
export function combatRuleAudit(manifest, characters, weapons, sets) {
  const entities = [...characters.map(entity => ({ kind: 'character', entity })), ...weapons.map(entity => ({ kind: 'weapon', entity })), ...sets.map(entity => ({ kind: 'set', entity }))]
    .map(({ kind, entity }) => {
      const owners = [entity.calculation, ...entity.talents ?? [], ...entity.passives ?? [], ...entity.constellations ?? [], ...entity.effects ?? []];
      const key = ref => JSON.stringify([ref.namespace, ref.id, ref.revision]);
      const granted = new Set(owners.flatMap(owner => owner.ruleIds.map(key)));
      const rules = entity.calculation.bundle.effects.filter(effect => granted.has(key(effect.identity))).map(effect => ({
        identity: effect.identity, sources: effect.sources, activation: effect.activation, target: effect.target, trigger: effect.trigger, lifetime: effect.lifetime,
      }));
      return {kind,id:entity.id,rules};
    });
  return { formatVersion: 2, dataVersion: manifest.dataVersion, meaning: 'Owned current effects only; bindings do not prove complete support.', entities,
    summary: { entities: entities.length, entitiesWithRules: entities.filter(entity => entity.rules.length).length, rules: entities.reduce((sum, entity) => sum + entity.rules.length, 0) } };
}
