import { APP_VERSION } from '@leyline/schema/version';
import { assembleHit } from './character-hits.mjs';
import { expression, all, grantBuffs } from '@leyline/schema/buffs';

export function assembleEquipment(metadata) {
  const { buffs, facts = {}, formulas = [], effects: pieces, support, ...fields } = metadata;
  if (fields.schemaVersion !== APP_VERSION) throw new Error('不支持的装备版本。');
  const { namespace, id, revision } = fields;
  const entity = { namespace, id, revision };
  const weapon = fields.kind === 'weapon-definition';
  const sources = ['content.' + (weapon ? 'weapon.' : 'set.') + id];
  const effects = [], coverage = [];
  const certify = (support, pieces) => {
    const identity = { namespace, id: weapon ? 'coverage.weapon.' + id : 'coverage.' + id + '.' + pieces, revision };
    coverage.push({ identity, entity, scope: { kind: 'equipment', ...(pieces ? { pieces } : {}) }, ...support, sources });
    return [identity];
  };
  const ruleIds = grantBuffs({ buffs }, effects, sources, facts);
  const families = new Set(['ordinary']);
  function hitEntries(owner, coverageRefs) {
    if (!owner.hits) return {};
    return { hits: owner.hits.map(({ family, when = [], ...hit }) => {
      families.add(family);
      return assembleHit({ ...hit, origin: 'triggered', coverageRefs, sources }, undefined, [{ family, condition: all(when.map(key => expression({ fact: key }, facts))) }], facts);
    }) };
  }
  const weaponCoverage = weapon ? certify(support) : [];
  const entries = weapon ? { coverageRefs: weaponCoverage, ...hitEntries(metadata, weaponCoverage) } : { effects: pieces.map(piece => {
    const coverageRefs = certify(piece.support, piece.pieces);
    return { pieces: piece.pieces, ruleIds: grantBuffs(piece, effects, sources, facts, { set: { id, pieces: piece.pieces } }), coverageRefs, ...hitEntries(piece, coverageRefs) };
  }) };
  return { ...fields, ...entries, metadata, sources, calculation: { ruleIds, bundle: {
    schemaVersion: APP_VERSION, runtimeVersion: APP_VERSION, requiredFeatures: ['fixed-templates-v1', 'combat-binding-v1', 'formula-call-v1', 'coverage-v1', ...(effects.length ? ['effect-v1'] : [])],
    sources: sources.map(id => ({ id, kind: 'definition' })), tables: [], attributes: [], stateMachines: [], aggregates: [], damageFamilies: [...families],
    formulas: formulas.map(({ id, template }) => ({ schemaVersion: APP_VERSION, identity: { namespace, id, revision: '1' }, sources, template })),
    effects, coverage,
  } } };
}
