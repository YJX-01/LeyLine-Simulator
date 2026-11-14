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

export function damagePathMarkdown(audit) {
  const cell = (entity, category) => {
    const talents = entity.talents.filter(talent => talent.category === category);
    if (!talents.length) return '不适用';
    return talents.map(talent => `${talent.hits.length} / ${talent.noIndependentDamage ? '无独立伤害' : talent.declaredSupported ? '已标记' : talent.hits.length ? '待规则' : '未绑定'}`).join('；');
  };
  return ['## 全目录伤害绑定索引', '',
    '由正式定义显式生成，覆盖全部角色/形态。表中为命中类型绑定数与当前技能支持标记，不是实际命中次数或全角色完成判定；同参数多次命中由用户逐次记录。未绑定参数也可能是持续时间、治疗等非伤害参数，不能自动当作缺失伤害。', '',
    `当前${audit.summary.entities}份定义、${audit.summary.talents}个技能，${audit.summary.boundTalents}个技能已有${audit.summary.boundHits}项命中类型绑定；其中${audit.summary.declaredSupportedTalents}个技能、${audit.summary.declaredSupportedHits}项绑定已标记支持。其余实体仍全部在覆盖范围。`, '',
    `其中${audit.summary.talentsWithInputs}个技能声明显式命中输入，${audit.summary.countedHits}项绑定包含输入控制的附加缩放；这不表示相应角色完整规则已支持。`, '',
    '| 角色/形态ID | 普攻类绑定 / 状态 | 战技绑定 / 状态 | 爆发绑定 / 状态 |',
    '| --- | --- | --- | --- |',
    ...audit.entities.map(entity => `| ${entity.name} (${entity.id}) | ${cell(entity, 'normal')} | ${cell(entity, 'skill')} | ${cell(entity, 'burst')} |`),
    '', '详细绑定、属性缩放、命中输入、元素、攻击类别和未绑定参数ID位于生成目录的damage-paths.json。普通构建只生成索引；文档由显式audit-damage-paths.mjs --write-docs更新。', ''].join('\n');
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
