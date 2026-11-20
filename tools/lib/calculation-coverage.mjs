import { APP_VERSION } from '../../src/schema/src/version.mjs';
import { combatRuleAudit, damagePathAudit } from './damage-path-audit.mjs';

const definitionKey = reference => JSON.stringify([reference.namespace, reference.id, reference.revision]);
const structured = entity => entity.schemaVersion === APP_VERSION && entity.calculation?.bundle !== undefined;

export function calculationCoverage(manifest, characters, weapons, sets, options = {}) {
  for (const [group, entities] of [['characters', characters], ['weapons', weapons], ['sets', sets]]) {
    if (JSON.stringify(entities.map(entity => entity.id)) !== JSON.stringify(manifest[group])) throw new Error(group + ': coverage entities must match the complete ordered manifest.');
  }
  const paths = damagePathAudit(manifest, characters);
  const rules = combatRuleAudit(manifest, characters, weapons, sets);
  const entries = [];
  const validations = new Map();
  for (const [kind, entities] of [['character', characters], ['weapon', weapons], ['set', sets]]) for (const entity of entities) {
    if (structured(entity)) validations.set(entity, typeof options.validate === 'function' ? options.validate(kind, entity)
      : { ok: false, diagnostics: [{ code: 'missing-dependency', message: '缺少当前结构化定义的编译校验。', jsonPointer: '' }] });
  }
  const add = (kind, entity, pointer, selector, declarations, complete = false, scopes = [], reason) => {
    const entry = { kind, entityId: entity.id, pointer, selector, declarations, resolution: complete ? 'complete' : 'unavailable',
      reason: reason ?? (complete ? '此条目的完整范围有可解析的已采用覆盖记录。' : '此条目的全部范围尚未闭合；有界查询范围单独列出。'), scopes };
    if (pointer === '' && validations.has(entity)) entry.diagnostics = validations.get(entity).diagnostics;
    entries.push(entry); return entry;
  };
  const proof = (entity, references, scope) => {
    const bundle = entity.calculation?.bundle, gaps = [], validation = validations.get(entity);
    if (!validation?.ok) gaps.push(...validation?.diagnostics.map(item => item.message) ?? ['缺少当前定义的编译校验。']);
    if (!references.length) gaps.push('缺少此查询范围的覆盖记录。');
    const records = new Map((bundle?.coverage ?? []).map(record => [definitionKey(record.identity), record]));
    const sources = new Set((bundle?.sources ?? []).map(source => source.id));
    const selected = [];
    for (const reference of new Map(references.map(reference => [definitionKey(reference), reference])).values()) {
      const record = records.get(definitionKey(reference));
      if (!record) { gaps.push('缺少覆盖记录：' + definitionKey(reference)); continue; }
      selected.push(record);
      const matches = record.scope.kind === 'context' ? scope.kind === 'hit' || scope.kind === 'context'
        : record.scope.kind === 'hit' ? scope.kind === 'hit' && record.scope.skillId === scope.skillId && record.scope.hitId === scope.hitId
          : scope.kind === 'equipment' && record.scope.pieces === scope.pieces;
      if (definitionKey(record.entity) !== definitionKey(entity) || !matches) gaps.push('覆盖记录的实体或查询范围不匹配。');
      if (record.resolution !== 'complete' || record.mechanisms.some(mechanism => mechanism.resolution === 'unavailable')) gaps.push(record.reason);
      if (record.evidence === 'declared') gaps.push('外部声明尚未作为本地覆盖证据采用。');
      if (record.sources.some(source => !sources.has(source))) gaps.push('覆盖记录缺少来源。');
    }
    const ranges = selected.filter(record => record.scope.kind === 'hit' || record.scope.kind === 'context');
    return { resolution: gaps.length ? 'unavailable' : 'complete',
      constellations: ranges.length ? { min: 0, max: Math.min(...ranges.map(record => record.scope.maxConstellation)) } : null,
      coverageRefs: references, sourceRefs: [...new Set(selected.flatMap(record => record.sources))],
      evidence: [...new Set(selected.map(record => record.evidence))], gaps: [...new Set(gaps)] };
  };
  const full = scope => scope.resolution === 'complete' && (scope.constellations === null || scope.constellations.max === 6);
  for (const character of characters) {
    const context = proof(character, character.calculation?.contextCoverageRefs ?? [], { kind: 'context' });
    const root = add('character', character, '', {}, { revision: character.revision }, false, [context]);
    const branches = [];
    for (const [talentIndex, talent] of character.talents.entries()) {
      const pointer = `/talents/${talentIndex}`;
      const talentEntry = add('talent', character, pointer, { skillId: talent.id }, { noIndependentDamage: talent.noIndependentDamage ?? false });
      const hits = [];
      for (const [hitIndex, hit] of talent.hits.entries()) {
        const scopes = (hit.outputs ?? []).map(output => ({ outputId: output.id, formula: output.invocation.formula,
          ...proof(character, [...hit.coverageRefs, ...output.coverageRefs], { kind: 'hit', skillId: talent.id, hitId: hit.id }) }));
        const complete = scopes.length > 0 && scopes.every(full);
        hits.push(complete);
        add('hit', character, `${pointer}/hits/${hitIndex}`, { skillId: talent.id, ...hit.id ? { hitId: hit.id } : { hitIndex } },
          { ...hit, effectiveElement: hit.element ?? talent.element, effectiveCategory: hit.category ?? talent.category }, complete, scopes);
      }
      const complete = full(context) && (hits.length ? hits.every(Boolean) : talent.noIndependentDamage === true);
      if (complete) { talentEntry.resolution = 'complete'; talentEntry.reason = '此技能的完整命座范围与相关机制有已采用覆盖。'; }
      branches.push(complete);
    }
    const branchCovered = id => full(context) && (character.calculation?.bundle.coverage ?? []).some(record =>
      record.scope.kind === 'context' && character.calculation.contextCoverageRefs.some(reference => definitionKey(reference) === definitionKey(record.identity))
      && record.mechanisms.some(mechanism => mechanism.id === id && mechanism.resolution !== 'unavailable'));
    for (const [index, passive] of character.passives.entries()) {
      const complete = branchCovered(passive.id); branches.push(complete);
      add('passive', character, `/passives/${index}`, { passiveId: passive.id, unlockAscension: passive.unlockAscension },
        { ruleIds: passive.ruleIds }, complete);
    }
    for (const [index, constellation] of character.constellations.entries()) {
      const complete = branchCovered('constellation:' + constellation.rank); branches.push(complete);
      add('constellation', character, `/constellations/${index}`, { rank: constellation.rank },
        { talentBonuses: constellation.talentBonuses, ruleIds: constellation.ruleIds }, complete);
    }
    if (full(context) && branches.every(Boolean)) { root.resolution = 'complete'; root.reason = '角色全部输出、被动与命座范围有已采用覆盖。'; }
  }
  for (const weapon of weapons) {
    const scope = proof(weapon, weapon.coverageRefs ?? [], { kind: 'equipment' });
    add('weapon', weapon, '', { refinements: weapon.rarity < 3 ? [1] : [1, 2, 3, 4, 5] },
      { ruleIds: weapon.calculation.ruleIds }, full(scope), [scope]);
  }
  for (const set of sets) {
    const root = add('set', set, '', {}, { sources: set.sources }), complete = [];
    for (const [index, effect] of set.effects.entries()) {
      const scope = proof(set, effect.coverageRefs ?? [], { kind: 'equipment', pieces: effect.pieces }); complete.push(full(scope));
      add('set-effect', set, `/effects/${index}`, { pieces: effect.pieces },
        { ruleIds: effect.ruleIds }, full(scope), [scope]);
    }
    if (complete.length && complete.every(Boolean)) { root.resolution = 'complete'; root.reason = '套装全部件数分支有已采用覆盖。'; }
  }
  return { schemaVersion: APP_VERSION, dataVersion: manifest.dataVersion, material: 'canonical',
    meaning: 'Compiled certificates describe their adopted constellation range, inputs and sources.',
    summary: { characters: characters.length, weapons: weapons.length, sets: sets.length, entries: entries.length,
      complete: entries.filter(entry => entry.resolution === 'complete').length, unavailable: entries.filter(entry => entry.resolution === 'unavailable').length,
      supportedOutputs: entries.filter(entry => entry.kind === 'hit').reduce((sum, entry) => sum + entry.scopes.filter(scope => scope.resolution === 'complete').length, 0),
      invalidDefinitions: [...validations.values()].filter(result => !result.ok).length },
    entries, bindings: paths, rules,
  };
}
