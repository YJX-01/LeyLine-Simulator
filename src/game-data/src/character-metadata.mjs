import { APP_VERSION } from '@leyline/schema/version';
import { assembleHit } from './character-hits.mjs';

const ref = (id, revision = '1', namespace = 'builtin') => ({ namespace, id, revision });
const mapValues = (object, convert) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, convert(value)]));
const attributeKeys = ['hp', 'hpPercent', 'attack', 'attackPercent', 'defense', 'defensePercent', 'critRate', 'critDamage', 'energyRecharge', 'elementalMastery',
  'physicalBonus', 'anemoBonus', 'geoBonus', 'electroBonus', 'hydroBonus', 'pyroBonus', 'cryoBonus', 'dendroBonus', 'healingBonus'];
const permanent = { kind: 'permanent' };

function expression(value, facts) {
  if (typeof value === 'number') return { kind: 'constant', value: { kind: 'quantity', unit: 'scalar', value } };
  if (value.call) return { kind: 'formula', formula: ref(value.call), inputs: mapValues(value.inputs, input => expression(input, facts)), output: value.output ?? 'value' };
  if (value.fact) {
    if (!Object.hasOwn(facts, value.fact)) throw new Error('Unknown character fact: ' + value.fact);
    return { kind: 'fact', key: value.fact, ...facts[value.fact] };
  }
  if (value.stat) return { kind: 'attribute', key: ref('attribute.' + value.stat), actor: { role: value.actor ?? 'owner' }, at: { kind: 'current', phase: 'same' } };
  if (value.state) return { kind: 'actor-state', actor: { role: 'owner' }, property: value.state };
  if (value.parameter) return { kind: 'talent-parameter', actor: { role: 'owner' }, skillId: value.skill, parameterId: value.parameter, type: { kind: 'quantity', unit: 'scalar' } };
  if (value.teamCount) return { kind: 'team-count', ...value.teamCount };
  throw new Error('Unknown character value: ' + JSON.stringify(value));
}

/** Load one authored definition. Shared curves and content version are supplied by the caller. */
export function assembleCharacter(metadata, curves, dataVersion) {
  const { namespace, id, revision, identity, attributes, progression, talents, passives, constellations, support, facts = {}, formulas = [], effects = [] } = metadata;
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
  const builtTalents = talents.map(talent => ({ ...talent, sources, hits: talent.hits.map(hit => {
    const { support: profile, coverageId, outputs, ...rest } = hit;
    const coverageRefs = certify(profile, { kind: 'hit', skillId: talent.id, hitId: hit.id }, coverageId ?? 'coverage.' + hit.id);
    return assembleHit({ ...rest, sources, coverageRefs, outputs: outputs.map(({ condition, ...o }) => ({ ...o, ...(condition !== undefined ? { condition: expression(condition, facts) } : {}) })) }, talent.id);
  }) }));
  const contextCoverageRefs = certify(metadata.contextSupport, { kind: 'context' }, metadata.contextCoverageId ?? 'coverage.' + id + '.context');
  const bindEffects = ({ effects = [], ...rest }) => ({ ...rest, ruleIds: effects.map(id => ref(id)) });
  const buildEffect = effect => ({
    identity: ref(effect.id), sources, activation: effect.activation ?? {}, trigger: effect.trigger ?? permanent, lifetime: effect.lifetime ?? permanent,
    recipient: effect.recipient === 'team' ? { role: 'team', excludeOwner: effect.excludeOwner ?? false } : { role: effect.recipient ?? 'owner' },
    target: { kind: 'attribute', attribute: ref(effect.target) }, value: expression(effect.value, facts),
    ...(effect.condition !== undefined ? { predicate: expression(effect.condition, facts) } : {}), appliesTo: effect.appliesTo ?? {},
    application: effect.application ?? 'always', priority: effect.priority ?? 0,
    stacking: { group: effect.id, scope: 'owner', policy: 'add', maxStacks: 1, retain: 'latest', ...effect.stacking },
  });
  const definition = { schemaVersion: APP_VERSION, kind: metadata.kind, ...entity, origin: namespace === 'builtin' ? 'builtin' : 'custom', dataVersion, identity,
    ...(metadata.derivedFrom ? { derivedFrom: metadata.derivedFrom } : {}), sources,
    progression: { curves: mapValues(progression.curveIds, key => {
      if (!Object.hasOwn(growthCurves, key)) throw new Error(id + ': unknown growth curve ' + key);
      return growthCurves[key];
    }), promotion: progression.promotion },
    attributes: { ...attributes, outputs: Object.fromEntries(attributeKeys.map(key => [key, ref('attribute.' + key)])) },
    talents: builtTalents, passives: passives.map(bindEffects), constellations: constellations.map(bindEffects),
    calculation: { ruleIds: (metadata.innateEffects ?? []).map(id => ref(id)), contextCoverageRefs,
      bundle: { schemaVersion: APP_VERSION, runtimeVersion: APP_VERSION, requiredFeatures: ['fixed-templates-v1', 'formula-call-v1', 'table-lookup-v1', 'combat-binding-v1', ...(effects.length ? ['effect-v1'] : []), 'coverage-v1'], sources: [{ kind: 'definition', id: sources[0] }],
        tables: [], attributes: [], stateMachines: [], aggregates: [], damageFamilies: [...new Set(['ordinary', ...builtTalents.flatMap(t => t.hits.flatMap(h => h.outputs.map(o => o.family)))])],
        formulas: formulas.map(({ id, template }) => ({ schemaVersion: APP_VERSION, identity: ref(id), sources, template })),
        effects: effects.map(buildEffect), coverage } },
  };
  if (namespace !== 'builtin') {
    const owned = new Set([...formulas, ...effects].map(entry => entry.id));
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
  return definition;
}
