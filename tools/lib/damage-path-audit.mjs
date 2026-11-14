/** Facts derived from every canonical entity, without text classification or inferred support. */
export function damagePathAudit(manifest, characters) {
  const entities = characters.map(character => ({
    id: character.id, name: character.identity.name, revision: character.revision,
    talents: character.talents.map(talent => {
      const references = new Set();
      const hits = talent.hits.map((hit, index) => {
        const terms = [{ stat: hit.scalingStat ?? 'attack', parameter: hit.parameter }, ...(hit.additionalScaling ?? [])];
        for (const term of terms) references.add(term.parameter);
        return { index, category: hit.category ?? talent.category, element: hit.element ?? talent.element, terms,
          ...(hit.snapshot ? { snapshot: hit.snapshot } : {}) };
      });
      return { id: talent.id, category: talent.category, declaredSupported: talent.support.supported, ...(talent.inputs ? { inputs: talent.inputs } : {}), ...(talent.noIndependentDamage ? { noIndependentDamage: true } : {}), hits,
        unboundParameterIds: talent.parameters.map(parameter => parameter.id).filter(id => !references.has(id)) };
    }),
    passives: character.passives.map(passive => ({ id: passive.id, declaredSupported: passive.support.supported })),
    constellations: character.constellations.map(constellation => ({ rank: constellation.rank, declaredSupported: constellation.support.supported })),
  }));
  const talents = entities.flatMap(entity => entity.talents);
  return { formatVersion: 1, dataVersion: manifest.dataVersion,
    meaning: 'Declared bindings only. Unbound parameters may be non-damage values. Bindings and support flags do not prove full character or P5 completion.',
    summary: { entities: entities.length, talents: talents.length, boundTalents: talents.filter(talent => talent.hits.length).length,
      boundHits: talents.reduce((total, talent) => total + talent.hits.length, 0),
      talentsWithInputs: talents.filter(talent => talent.inputs?.length).length,
      countedHits: talents.reduce((total, talent) => total + talent.hits.filter(hit => hit.terms.some(term => term.count)).length, 0),
      declaredSupportedTalents: talents.filter(talent => talent.declaredSupported).length,
      declaredSupportedHits: talents.filter(talent => talent.declaredSupported).reduce((total, talent) => total + talent.hits.length, 0) },
    entities };
}

/** Inventory all source families; a rule binding is not a character completion judgment. */
export function combatRuleAudit(manifest, characters, weapons, sets) {
  const describe = (rules, unlock) => (rules ?? []).map(rule => ({ id: rule.id, revision: rule.revision, source: rule.source, ...(rule.support ? { support: rule.support } : {}), unlock,
    attributesRead: rule.nodes.filter(node => node.op === 'attribute').map(node => node.key),
    statesRead: rule.nodes.filter(node => node.op === 'combat-state').map(node => node.field),
    parameters: rule.nodes.filter(node => node.op === 'talent-parameter').map(node => ({ skillId: node.skillId, parameter: node.parameter })),
    operators: [...new Set(rule.nodes.map(node => node.op))],
    effects: rule.effects.map(effect => ({ id: effect.id, attribute: effect.attribute ?? 'damageBonus', unit: effect.unit ?? 'scalar',
      recipient: effect.recipient ?? 'self', trigger: effect.trigger ?? null, appliesTo: effect.appliesTo ?? null, permanent: effect.permanent ?? false,
      requiresApplication: effect.requiresApplication ?? false })) }));
  const entities = [
    ...characters.map(character => ({ kind: 'character', id: character.id, rules: [
      ...describe(character.combatRules, {}),
      ...character.passives.flatMap(passive => describe(passive.combatRules, { passive: passive.id, ascension: passive.unlockAscension })),
      ...character.constellations.flatMap(item => describe(item.combatRules, { constellation: item.rank })),
    ] })),
    ...weapons.map(weapon => ({ kind: 'weapon', id: weapon.id, rules: describe(weapon.combatRules, { refinement: [1, 2, 3, 4, 5] }) })),
    ...sets.map(set => ({ kind: 'set', id: set.id, rules: set.effects.flatMap(effect => describe(effect.combatRules, { pieces: effect.pieces })) })),
  ];
  return { formatVersion: 1, dataVersion: manifest.dataVersion, meaning: 'Explicit snapshot rule declarations only; empty entries remain in scope and bindings do not prove full support.',
    summary: { entities: entities.length, entitiesWithRules: entities.filter(entity => entity.rules.length).length,
      rules: entities.reduce((total, entity) => total + entity.rules.length, 0) }, entities };
}
