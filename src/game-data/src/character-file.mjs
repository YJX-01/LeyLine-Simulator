import { APP_VERSION } from '@leyline/schema/version';
import { definitionKey, structuredCharacterDefinitionSchema } from '@leyline/schema';
import { assembleCalculationLibrary } from './calculation-library.mjs';
import { createContentLinker } from './link-content.mjs';
import { assembleCharacter } from './character-metadata.mjs';
import standardCurves from '../data/tables/character-curves.json';
import common from '../data/calculation/common.json';
import reactions from '../data/calculation/reactions.json';

const sharedFormulas = new Set([...common.formulas, ...reactions.calculation.formulas].map(f => f.identity.id));
const ids = refs => refs.map(ref => ref.id);
const omitSource = ({ source, ...fields }) => fields;
const grants = ({ ruleIds, ...fields }) => ruleIds.length ? { ...fields, effects: ids(ruleIds) } : fields;

function encodeExpression(binding, facts) {
  switch (binding.kind) {
    case 'constant': return binding.value.value;
    case 'attribute': return { stat: binding.key.id.slice('attribute.'.length), ...(binding.actor.role === 'owner' ? {} : { actor: binding.actor.role }) };
    case 'actor-state': return { state: binding.property };
    case 'team-count': { const { kind, ...teamCount } = binding; return { teamCount }; }
    case 'talent-parameter': return { skill: binding.skillId, parameter: binding.parameterId };
    case 'fact': facts[binding.key] = { scope: binding.scope, type: binding.type }; return { fact: binding.key };
    case 'formula': return { call: binding.formula.id, inputs: Object.fromEntries(Object.entries(binding.inputs).map(([key, value]) => [key, encodeExpression(value, facts)])),
      ...(binding.output === 'value' ? {} : { output: binding.output }) };
    default: throw new Error('角色文件尚不支持此数值形式：' + binding.kind);
  }
}

function scaling(base) {
  const terms = base.formula.id === 'damage-sum-2' ? Object.values(base.bindings) : [{ formula: base.formula, inputs: base.bindings }];
  return terms.map(({ formula, inputs: { attribute, ratio, count } }) => ({
    stat: attribute.key.id.slice('attribute.'.length),
    ...(ratio.kind === 'constant' ? { ratio: ratio.value.value } : { parameter: ratio.parameterId }),
    ...(count ? { count: count.key } : {}), ...(count && count.type.unit !== 'count' ? { countUnit: count.type.unit } : {}),
    ...(formula.id !== attribute.key.id.slice('attribute.'.length) + (count ? '-counted' : '') + '-damage-base' ? { formula: formula.id } : {}),
  }));
}

function encodeEffect(effect, facts) {
  const defaults = { group: effect.identity.id, scope: 'owner', policy: 'add', maxStacks: 1, retain: 'latest' };
  const stacking = Object.fromEntries(Object.entries(effect.stacking).filter(([key, value]) => defaults[key] !== value));
  return { id: effect.identity.id, target: effect.target.attribute.id, value: encodeExpression(effect.value, facts),
    ...(effect.predicate ? { condition: encodeExpression(effect.predicate, facts) } : {}),
    ...(Object.keys(effect.activation).length ? { activation: effect.activation } : {}),
    ...(effect.recipient.role === 'team' && effect.recipient.excludeOwner ? { excludeOwner: true } : {}),
    ...(effect.recipient.role !== 'owner' ? { recipient: effect.recipient.role } : {}),
    ...(Object.keys(effect.appliesTo).length ? { appliesTo: effect.appliesTo } : {}), ...(effect.priority ? { priority: effect.priority } : {}),
    ...(Object.keys(stacking).length ? { stacking } : {}), ...(effect.application !== 'always' ? { application: effect.application } : {}),
    ...(effect.trigger.kind !== 'permanent' ? { trigger: effect.trigger, lifetime: effect.lifetime } : {}) };
}

/** File metadata carries editable declarations. Each nonstandard growth curve is included once. */
export function describeCharacter(character) {
  const { namespace, id, revision, identity, derivedFrom, calculation, progression } = character;
  const bundle = calculation.bundle, support = {}, facts = {}, curves = {}, profileIds = new Map(), byRecord = new Map();
  const curveIds = Object.fromEntries(Object.entries(progression.curves).map(([stat, values]) => {
    const key = Object.entries({ ...standardCurves, ...curves }).find(([, curve]) => curve.length === values.length && curve.every((v, i) => v === values[i]))?.[0] ?? id + '.' + stat;
    if (!Object.hasOwn(standardCurves, key)) curves[key] = values;
    return [stat, key];
  }));
  for (const record of bundle.coverage) {
    const { scope, resolution, evidence, reason } = record;
    const profile = { maxConstellation: scope.maxConstellation, resolution, evidence, reason,
      mechanisms: record.mechanisms.map(m => ({ id: m.id, resolution: m.resolution, ...(m.ruleIds.length ? { rules: ids(m.ruleIds) } : {}),
        ...(m.reason === reason ? {} : { reason: m.reason }), ...(m.impact ? { impact: m.impact } : {}) })) };
    const bytes = JSON.stringify(profile), base = scope.kind + '-' + resolution;
    if (!profileIds.has(bytes)) {
      let key = base, n = 1;
      while (Object.hasOwn(support, key)) key = base + '-' + ++n;
      support[key] = profile; profileIds.set(bytes, key);
    }
    byRecord.set(record.identity.id, profileIds.get(bytes));
  }
  const talents = character.talents.map(({ sources, hits, inputs, ...talent }) => ({ ...talent,
    ...(inputs ? { inputs: inputs.map(input => ({ ...omitSource(input), ...(input.constellationLimits ? { constellationLimits: input.constellationLimits.map(omitSource) } : {}) })) } : {}),
    hits: hits.map(({ base, outputs, coverageRefs, sources, snapshot, ...hit }) => ({ ...hit, ...(snapshot ? { snapshot: omitSource(snapshot) } : {}),
      scaling: scaling(base), outputs: outputs.map(o => ({ id: o.id, family: o.family, ...(o.origin !== 'talent' ? { origin: o.origin } : {}),
        ...(o.invocation.predicate ? { condition: encodeExpression(o.invocation.predicate, facts) } : {}) })),
      support: byRecord.get(coverageRefs[0].id), ...(coverageRefs[0].id !== 'coverage.' + hit.id ? { coverageId: coverageRefs[0].id } : {}) })) }));
  const formulas = bundle.formulas.filter(f => !sharedFormulas.has(f.identity.id)).map(f => ({ id: f.identity.id, template: f.template }));
  const effects = bundle.effects.map(effect => encodeEffect(effect, facts));
  const contextId = calculation.contextCoverageRefs[0].id;
  return { schemaVersion: APP_VERSION, kind: character.kind, namespace, id, revision, ...(derivedFrom ? { derivedFrom } : {}), identity,
    attributes: { base: character.attributes.base, specialized: character.attributes.specialized }, progression: { curveIds, promotion: progression.promotion },
    talents, passives: character.passives.map(grants), constellations: character.constellations.map(grants),
    ...(formulas.length ? { formulas } : {}), ...(effects.length ? { effects } : {}), ...(Object.keys(facts).length ? { facts } : {}),
    ...(calculation.ruleIds.length ? { innateEffects: ids(calculation.ruleIds) } : {}), support, contextSupport: byRecord.get(contextId),
    ...(contextId !== 'coverage.' + id + '.context' ? { contextCoverageId: contextId } : {}),
    ...(Object.keys(curves).length ? { curves } : {}) };
}

export function resolveCharacterFile(metadata, dataVersion) {
  return assembleCharacter(metadata, standardCurves, dataVersion);
}

export function linkCharacterFile(metadata, dataVersion, collectCalculationRoots) {
  const character = resolveCharacterFile(metadata, dataVersion);
  const library = assembleCalculationLibrary(common, reactions, [character]);
  return createContentLinker({ schemas: { definitionKey, structuredCharacterDefinitionSchema }, collectCalculationRoots, library }).character(character);
}
