import publicData from '../data/calculation/resonances.json' with { type: 'json' };
import { authoredHitEntries } from '@leyline/schema/hit-bindings';
import { all, expression, grantBuffs } from '@leyline/schema/buffs';
import { APP_VERSION } from '@leyline/schema/version';
import { assembleHit } from './character-hits.mjs';

const ref = (id, revision = '1', namespace = 'builtin') => ({ namespace, id, revision });
const mapValues = (object, convert) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, convert(value)]));
const attributeKeys = ['hp', 'hpPercent', 'attack', 'attackPercent', 'defense', 'defensePercent', 'critRate', 'critDamage', 'energyRecharge', 'elementalMastery',
  'physicalBonus', 'anemoBonus', 'geoBonus', 'electroBonus', 'hydroBonus', 'pyroBonus', 'cryoBonus', 'dendroBonus', 'healingBonus'];


/** Load one authored definition. Shared curves and content version are supplied by the caller. */
export function assembleCharacter(metadata, curves, dataVersion) {
  const { namespace, id, revision, identity, attributes, progression, talents, passives, constellations, support, facts = {}, formulas = [] } = metadata;
  if (metadata.schemaVersion !== APP_VERSION || metadata.kind !== 'character-definition') throw new Error('Unsupported character metadata: ' + id);
  for (const key of Object.keys(metadata.curves ?? {})) {
    if (Object.hasOwn(curves, key)) throw new Error('自定义曲线与公共曲线 ID 冲突：' + key);
  }
  const growthCurves = { ...curves, ...metadata.curves };
  const entity = ref(id, revision, namespace);
  const sources = ['character.' + namespace + '.' + id];
  const coverage = [];
  function certify(profile, scope, coverageId) {
    if (!Object.hasOwn(support, profile)) throw new Error(id + ': unknown support scope ' + profile);
    const { maxConstellation, mechanisms, ...fields } = support[profile];
    const identity = ref(coverageId, revision, namespace);
    coverage.push({ identity, entity, scope: { ...scope, maxConstellation }, ...fields, sources,
      mechanisms: mechanisms.map(({ rules = [], reason = fields.reason, ...entry }) => ({ ...entry, reason, ruleIds: rules.map(id => ref(id)) })) });
    return [identity];
  }
  const effects = [];
  const localFormulas = [...formulas];
  const grant = (owner, unlock, talent) => grantBuffs(owner, effects, sources, facts, unlock, talent, talents);
  const innateRules = grant(metadata);
  const builtTalents = talents.map(({ buffs, ...talent }) => {
    const ruleIds = grant({ buffs }, {}, talent);
    return { ...talent, sources, ruleIds, hits: authoredHitEntries(metadata, talent.id).map(({ hit: declaration, unlock }) => {
      const { support: profile, coverageId, family = 'ordinary', when = [], skill: owningSkill, origin = owningSkill ? 'triggered' : 'talent', ...hit } = declaration;
      const coverageRefs = certify(profile, { kind: 'hit', skillId: talent.id, hitId: hit.id }, coverageId ?? 'coverage.' + hit.id);
      const conditions = when.map(v => expression(typeof v === 'string' ? { fact: v } : v, facts));
      if (hit.coordinated) conditions.push(expression({ fact: hit.coordinated.readyFact }, facts));
      if (unlock?.rank) conditions.unshift(expression({ call: 'rank.at-least-' + unlock.rank,
        inputs: { rank: { state: unlock.state, actor: hit.coordinated ? 'contributor' : 'owner' } }, output: 'active' }, facts));
      if (hit.elementBy === 'absorbedElement') conditions.push(expression({ call: 'condition.not', inputs: { term0: {
        call: 'element.unconverted', inputs: { mode: { fact: hit.elementBy } }, output: 'active' } }, output: 'active' }, facts));
      const predicate = all(conditions);
      const branches = family === 'unresolved' ? [] : [{ family, condition: predicate }];
      return assembleHit({ ...hit, origin, category: hit.category ?? talent.category, element: hit.element ?? talent.element,
        sources, coverageRefs }, talent.id, branches, facts);
    }) };
  });
  const contextCoverageRefs = certify(metadata.contextSupport, { kind: 'context' }, metadata.contextCoverageId ?? 'coverage.' + id + '.context');
  const builtPassives = passives.map(({ buffs, hits, ...p }) => ({ ...p, ruleIds: grant({ buffs }, p.unlockAscension ? { ascension: p.unlockAscension } : {}) }));
  const builtConstellations = constellations.map(({ buffs, hits, ...c }) => ({ ...c, ruleIds: grant({ buffs }, { constellation: c.rank }) }));
  const definition = { schemaVersion: APP_VERSION, kind: metadata.kind, ...entity, origin: namespace === 'builtin' ? 'builtin' : 'custom', dataVersion, identity,
    ...(metadata.derivedFrom ? { derivedFrom: metadata.derivedFrom } : {}), sources,
    progression: { curves: mapValues(progression.curveIds, key => {
      if (!Object.hasOwn(growthCurves, key)) throw new Error(id + ': unknown growth curve ' + key);
      return growthCurves[key];
    }), promotion: progression.promotion },
    attributes: { ...attributes, outputs: Object.fromEntries(attributeKeys.map(key => [key, ref('attribute.' + key)])) },
    talents: builtTalents, passives: builtPassives, constellations: builtConstellations,
    calculation: { ruleIds: innateRules, contextCoverageRefs,
      gleam: {name:publicData.gleam.name,ruleIds:publicData.gleam.buffs.flatMap(b=>b.modifiers.flatMap((m,i)=>
        m.ownerElements.includes(identity.element)?[ref(i ? b.id+'.'+i : b.id)]:[]))},
      resonances: publicData.resonances.map(({ element, name, buffs, particles }) => ({ element, name, ruleIds: buffs.flatMap(buff => buff.modifiers.map((_,i) => ref(i ? buff.id + '.' + i : buff.id))), ...(particles ? { particles } : {}) })),
      bundle: { schemaVersion: APP_VERSION, runtimeVersion: APP_VERSION, requiredFeatures: ['fixed-templates-v1', 'formula-call-v1', 'table-lookup-v1', 'combat-binding-v1', ...(effects.length ? ['effect-v1'] : []), 'coverage-v1'], sources: [{ kind: 'definition', id: sources[0] }],
        tables: [], attributes: [], stateMachines: [], aggregates: [], damageFamilies: [...new Set(['ordinary', ...builtTalents.flatMap(t => t.hits.flatMap(h => Object.keys(h.damage)))])],
        formulas: localFormulas.map(({ id, template }) => ({ schemaVersion: APP_VERSION, identity: ref(id), sources, template })),
        effects, coverage } },
  };
  if (namespace !== 'builtin') {
    const owned = new Set([...localFormulas.map(entry => entry.id), ...effects.map(entry => entry.identity.id)]);
    const relink = value => {
      if (!value || typeof value !== 'object') return;
      if (value.namespace === 'builtin' && owned.has(value.id) && value.revision) {
        value.namespace = namespace;
        value.revision = revision;
      }
      Object.values(value).forEach(relink);
    };
    relink(definition);
  }
  return { ...definition, metadata };
}
