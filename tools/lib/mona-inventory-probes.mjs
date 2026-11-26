import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { authoredHitEntries } from '../../src/schema/src/calculation/hit-bindings.mjs';
import { conditionFactInputs } from '../../src/schema/src/calculation/buffs.mjs';
import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';

// --- mona-calculation-inventory.mjs ---
const root = fileURLToPath(new URL('../../.references/mona-community/', import.meta.url));
const source = path => `.references/mona-community/${path}`;
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8').replace(/^(?:\s*\/\/[^\n]*\n)*\s*export default\s*/, ''));
const entries = object => Object.entries(object).sort(([a], [b]) => a.localeCompare(b, 'en'));
const pointer = (...parts) => '/' + parts.map(part => String(part).replaceAll('~', '~0').replaceAll('/', '~1')).join('/');

/** Enumerate published metadata and serializable effect declarations; missing upstream data is an error. */
export async function monaCalculationInventory({ probes } = {}) {
  if (!existsSync(root)) throw new Error(`Mona checkout missing: ${root}`);
  const characters = read('src/assets/_gen_character.js');
  const labels = read('src/i18n/generated/zh-cn.json');
  const buffs = read('src/assets/_gen_buff.js');
  const weapons = read('src/assets/_gen_weapon.js');
  const artifacts = read('src/assets/_gen_artifact.js');
  const [characterEffects, scopedEffects, extensionBuffs, teamRules, teamConfig, equipmentRules] = await Promise.all([
    import('../../.references/mona-community/beta-data/character-effect-rules.mjs'),
    import('../../.references/mona-community/beta-data/scoped-character-effect-rules.mjs'),
    import('../../.references/mona-community/beta-data/extension-buffs.mjs'),
    import('../../.references/mona-community/beta-data/team-engine/registry.mjs'),
    import('../../.references/mona-community/beta-data/team-dps-config.mjs'),
    import('../../.references/mona-community/beta-data/equipment-axis-rules.mjs'),
  ]);
  const { CHARACTER_EFFECT_RULES } = characterEffects;
  const { STELLAR_SUPPORT_RULES, VODYANITSA_SUPPORT_RULES } = scopedEffects;
  const { EXTENSION_BUFF_ADAPTERS } = extensionBuffs;
  const { characterRules } = teamRules;
  const { TEAM_DPS_ACTIONS } = teamConfig;
  const { AUTO_WEAPON_FIELDS, AUTO_ARTIFACT_SETS, AUTO_EQUIPMENT_BUFFS } = equipmentRules;
  const rows = [];
  for (const [character, data] of entries(characters)) {
    const indices = new Map();
    for (const group of [1, 2, 3]) for (const [position, item] of data[`skillMap${group}`].entries()) {
      const occurrences = indices.get(item.index) ?? [];
      occurrences.push({ group, position, text: item.text, label: labels[item.text] ?? null, pointer: pointer(character, `skillMap${group}`, position) });
      indices.set(item.index, occurrences);
    }
    for (const [index, occurrences] of [...indices].sort(([a], [b]) => a - b)) rows.push({
      id: `mona:skill:${character}:${index}`, kind: 'skill', character, index, occurrences,
      element: data.element, weapon: data.weapon, characterLabel: labels[data.nameLocale] ?? null, source: { path: source('src/assets/_gen_character.js'), pointer: pointer(character) },
    });
    for (const field of ['config', 'configSkill']) for (const [position, value] of (data[field] ?? []).entries()) rows.push({
      id: `mona:input:character:${character}:${field}:${position}`, kind: 'input', ownerType: 'character', owner: character, field, value,
      source: { path: source('src/assets/_gen_character.js'), pointer: pointer(character, field, position) },
    });
  }
  for (const [key, data] of entries(buffs)) rows.push({
    id: `mona:buff:${key}`, kind: 'buff', key, label: labels[data.nameLocale] ?? null, genre: data.genre, selectable: data.selectable !== false,
    config: data.config ?? [], structured: Object.hasOwn(CHARACTER_EFFECT_RULES, key), adapter: EXTENSION_BUFF_ADAPTERS.includes(key),
    source: { path: source('src/assets/_gen_buff.js'), pointer: pointer(key) },
  });
  for (const [book, rules, path] of [
    ['character', CHARACTER_EFFECT_RULES, 'beta-data/character-effect-rules.mjs'],
    ['stellar', STELLAR_SUPPORT_RULES, 'beta-data/scoped-character-effect-rules.mjs'],
    ['vodyanitsa', VODYANITSA_SUPPORT_RULES, 'beta-data/scoped-character-effect-rules.mjs'],
  ]) for (const [key, rule] of entries(rules)) for (const [position, effect] of (rule.effects ?? []).entries()) rows.push({
    id: `mona:effect:${book}:${key}:${position}`, kind: 'effect', book, key, position, effect,
    when: rule.when ?? null, variables: rule.variables ?? null,
    source: { path: source(path), pointer: `${{ character: 'CHARACTER_EFFECT_RULES', stellar: 'STELLAR_SUPPORT_RULES', vodyanitsa: 'VODYANITSA_SUPPORT_RULES' }[book]}.${key}.effects[${position}]` },
  });
  for (const [ownerType, data, path] of [['weapon', weapons, 'src/assets/_gen_weapon.js'], ['artifact', artifacts, 'src/assets/_gen_artifact.js']]) {
    for (const [owner, item] of entries(data)) for (const [field, value] of entries(item)) {
      if (!field.toLowerCase().includes('config') || !Array.isArray(value)) continue;
      for (const [position, config] of value.entries()) rows.push({ id: `mona:input:${ownerType}:${owner}:${field}:${position}`, kind: 'input', ownerType, owner, field, value: config, source: { path: source(path), pointer: pointer(owner, field, position) } });
    }
  }
  for (const [type, values] of [['weapon-fields', Object.entries(AUTO_WEAPON_FIELDS)], ['artifact-set', AUTO_ARTIFACT_SETS.map(x => [x, true])], ['equipment-buff', [...AUTO_EQUIPMENT_BUFFS].map(x => [x, true])]]) for (const [key, value] of values.sort(([a], [b]) => a.localeCompare(b, 'en'))) rows.push({ id: `mona:auto:${type}:${key}`, kind: 'automatic-rule', type, key, value, source: { path: source('beta-data/equipment-axis-rules.mjs'), pointer: `${type}.${key}` } });
  for (const [key, rule] of entries(characterRules)) rows.push({ id: `mona:auto:character:${key}`, kind: 'automatic-rule', type: 'character', key, modeled: rule.modeled ?? [], element: rule.element, resolution: 'opaque-function', source: { path: source('beta-data/team-engine/registry.mjs'), pointer: `characterRules.${key}` } });
  for (const [key, value] of entries(TEAM_DPS_ACTIONS)) rows.push({ id: `mona:action:${key}`, kind: 'action', key, value, source: { path: source('beta-data/team-dps-config.mjs'), pointer: `TEAM_DPS_ACTIONS.${key}` } });
  for (const row of rows.filter(row => row.kind === 'skill')) rows.push({ id: `mona:open:skill:${row.character}:${row.index}`, kind: 'open', parentId: row.id, reason: 'conditional output families and coefficient branches need source review beyond default probes', source: row.source });
  for (const [key, data] of entries(buffs)) if (!Object.hasOwn(CHARACTER_EFFECT_RULES, key) && !Object.hasOwn(STELLAR_SUPPORT_RULES, key) && !Object.hasOwn(VODYANITSA_SUPPORT_RULES, key)) rows.push({ id: `mona:open:buff:${key}`, kind: 'open', parentId: `mona:buff:${key}`, key, reason: EXTENSION_BUFF_ADAPTERS.includes(key) ? 'function adapter effects require inspection' : 'legacy or specialized effect requires inspection', source: { path: source('src/assets/_gen_buff.js'), pointer: pointer(key) } });
  for (const key of ['swirl_cryo','swirl_hydro','swirl_pyro','swirl_electro','overload','electro_charged','shatter','superconduct','bloom','hyperbloom','burgeon','burning','crystallize']) rows.push({ id: `mona:reaction:${key}`, kind: 'reaction-field', key, output: key === 'crystallize' ? 'shield' : 'damage', source: { path: source('mona_core/src/damage/transformative_damage.rs'), pointer: `TransformativeDamage.${key}` } });
  for (const key of ['Messenger','SkywardSpine','Frostbearer','DragonspineSpear','Halberd','PrizedIsshinBlade','SwordOfNarzissenkreuz','SkywardAtlas','EyeOfPerception','FilletBlade','SwordOfDescension','SkywardBlade','CursedBlade','AshGravenDrinkingHorn','TheFlute']) rows.push({ id: `mona:equipment-event:${key}`, kind: 'equipment-event', key, source: { path: source('beta-data/equipment-damage-events.mjs'), pointer: `equipmentDamageEvents:${key}` }, resolution: 'source-review-required' });
  for (const key of ['OceanHuedClam','SongOfDaysPast','EchoesOfAnOffering']) rows.push({ id: `mona:equipment-event:${key}`, kind: 'equipment-event', key, source: { path: source(key === 'EchoesOfAnOffering' ? 'beta-data/equipment-damage-events.mjs' : 'beta-data/equipment-healing-damage-rules.mjs'), pointer: key }, resolution: 'source-review-required' });
  if (probes) for (const probe of probes.rows) {
    if (probe.status !== 'ok') { rows.push({ id: `mona:open:probe:${probe.character}:${probe.index}:c${probe.constellation}`, kind: 'open', parentId: probe.skillId, reason: probe.error, source: { path: probes.source, pointer: 'CalculatorInterface.get_damage_analysis' } }); continue; }
    for (const branch of probe.branches) rows.push({ id: `mona:branch:${probe.character}:${probe.index}:c${probe.constellation}:${probe.scenarioId ?? 'default'}:${branch.key}`, kind: 'output-branch', parentId: probe.skillId, character: probe.character, index: probe.index, branch: branch.key,
      output: probe.analysis.is_heal ? 'healing' : probe.analysis.is_shield ? 'shield' : 'damage', element: probe.analysis.element,
      scenario: { id: probe.scenarioId ?? 'default', constellation: probe.constellation, input: probe.input }, result: branch.result, source: { path: probes.source, pointer: 'CalculatorInterface.get_damage_analysis' } });
  }
  for (const [key, path, symbol] of [
    ['transformative', 'mona_core/src/damage/transformative_damage.rs', 'TransformativeDamage'],
    ['equipment-damage', 'beta-data/equipment-damage-events.mjs', 'equipmentDamageEvents'],
    ['equipment-healing-damage', 'beta-data/equipment-healing-damage-rules.mjs', 'equipmentHealingDamage'],
  ]) rows.push({ id: `mona:entry:${key}`, kind: 'entry-point', key, symbol, source: { path: source(path), pointer: symbol } });
  return { revision: '589ac6919057709924c0c20d5a9d673fe9b0be1a', rows, limitations: [
    'Effect rows cover serializable character and scoped rules only; function adapters and legacy WASM effects require source review or probes.',
    'Skill output branches require runtime probes; no completeness is inferred from default configurations.',
    'Automatic rule rows enumerate exported equipment and team-axis registries, not every conditional implementation or character grant.',
    'Equipment event entries identify source branches; they do not prove execution, event multiplicity, or game correctness.',
  ] };
}

// --- mona-calculation-probes.mjs ---
const novice = { Sword: 'DullBlade', Claymore: 'WasterGreatsword', Polearm: 'BeginnersProtector', Bow: 'HuntersBow', Catalyst: 'ApprenticesNotes' };
const defaults = (name, fields) => fields?.length ? { [name]: Object.fromEntries(fields.map(field => [field.name, field.default])) } : 'NoConfig';
const artifacts = ['Flower', 'Feather', 'Sand', 'Goblet', 'Head'].map((slot, i) => ({
  id: i + 1, set_name: 'GladiatorsFinale', slot, level: 20, star: 5,
  main_stat: [i === 0 ? 'HPFixed' : i === 1 ? 'ATKFixed' : 'ATKPercentage', i === 0 ? 4780 : i === 1 ? 311 : .466],
  sub_stats: [['Recharge', .2], ['ElementalMastery', 20]],
}));

/** Probe published runtime; failures are records, not silently omitted. */
export async function probeMonaSkills({ characters: selected, constellations = [0, 6], indices, configure, scenarioId = 'default' } = {}) {
  const [{ api, read }, { visibleDamageReactionKeys }] = await Promise.all([
    import('../../.references/mona-community/beta-tools/runtime-7106.mjs'),
    import('../../.references/mona-community/src/algorithms/reaction-labels.mjs'),
  ]);
  const characters = read('src/assets/_gen_character.js');
  const rows = [];
  for (const name of (selected ?? Object.keys(characters)).slice().sort()) {
    const character = characters[name];
    if (!character) throw new Error(`Unknown Mona character: ${name}`);
    const available = [...new Set([1, 2, 3].flatMap(group => character[`skillMap${group}`].map(row => row.index)))].sort((a, b) => a - b);
    for (const constellation of constellations) for (const index of available.filter(i => !indices || indices.includes(i))) {
      const input = {
        character: { name, level: 90, ascend: false, constellation, skill1: 9, skill2: 9, skill3: 9, params: defaults(name, character.config) },
        weapon: { name: novice[character.weapon], level: 90, ascend: false, refine: 1, params: 'NoConfig' },
        skill: { index, config: defaults(name, character.configSkill) }, artifacts, enemy: null, buffs: [], artifact_config: null,
      };
      if (configure) configure(input, { name, index, constellation });
      const base = { scenarioId, skillId: `mona:skill:${name}:${index}`, character: name, index, constellation, input };
      try {
        const result = api.CalculatorInterface.get_damage_analysis(input, null);
        const keys = visibleDamageReactionKeys(result);
        rows.push({ ...base, status: 'ok', analysis: result, branches: keys.map(key => ({ key, result: result[key] })), reactionAvailability: result.reaction_availability ?? null });
      } catch (error) {
        rows.push({ ...base, status: 'error', error: String(error?.message ?? error) });
      }
    }
  }
  return { source: '.references/mona-community/beta-tools/runtime-7106.mjs', rows, limitations: ['Default configurations at the specified constellations only; unobserved branches are unknown.', 'Visible reaction keys follow Mona UI filtering; other runtime fields are not enumerated.'] };
}

// Ignore insignificant floating-point drift while retaining original changed values.
function differences(before, after, path = '') {
  if (Object.is(before, after)) return [];
  if (typeof before === 'number' && typeof after === 'number' && Number.isFinite(before) && Number.isFinite(after) && Math.abs(before - after) <= 1e-12 * Math.max(1, Math.abs(before), Math.abs(after))) return [];
  if (before && after && typeof before === 'object' && typeof after === 'object') {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])].sort().flatMap(key => differences(before[key], after[key], `${path}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`));
  }
  return [{ path, before: before ?? null, after: after ?? null }];
}
function alternate(field) {
  const value = field.default;
  if (typeof value === 'boolean') return !value;
  if (field.type === 'option' && Array.isArray(field.options) && field.options.length > 1) return value === 0 ? 1 : 0;
  if (typeof value === 'number') {
    if (typeof field.max === 'number' && field.max !== value) return field.max;
    if (typeof field.min === 'number' && field.min !== value) return field.min;
    if (field.type === 'floatPercentageInput') return value === 1 ? .5 : 1;
    return value === 1 ? 2 : 1;
  }
  if (Array.isArray(value)) return value.length ? [] : null;
  return null;
}
function namedBuff(name, params) {
  return { name, config: Object.keys(params).length ? { [name]: params } : 'NoConfig' };
}
function safeCall(fn) {
  try { return { status: 'ok', value: fn() }; }
  catch (error) { return { status: 'error', error: String(error?.message ?? error) }; }
}

export function classifyMonaBuffDiagnostic(key, recipient, params, comparison) {
  const errors = ['attribute', 'damage', 'lockedAttribute', 'lockedDamage'].map(field => comparison[field]?.error).filter(Boolean);
  const error = errors[0];
  if (errors.length && errors.every(item => item === '杜林BUFF须明确本次反应的另一元素') && ['DurinC2', 'DurinTalent2'].includes(key) && params.reaction_element === 0) {
    return { kind: 'invalid-input', reason: 'reaction element is unselected', field: 'reaction_element' };
  }
  if (errors.length && errors.every(item => item === '百万吨重锤定额只属于莉奈娅自身直伤') && key === 'LinneaC1' && params.hit_mode === 1 && recipient !== 'Linnea') {
    return { kind: 'invalid-input', reason: 'direct hit mode requires Linnea as recipient', field: 'hit_mode' };
  }
  return error ? { kind: 'execution-failure', reason: errors.join('; ') } : null;
}

/** Actual release comparisons. Zero delta describes this scenario only, never absence of an effect. */
export async function probeMonaBuffs({ keys, recipients = ['Bennett', 'Lisa'], vary = true, skillProbes, params = {}, scenarioPrefix = '', contextual = true } = {}) {
  const { api, read } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const catalog = read('src/assets/_gen_buff.js');
  const selected = (keys ?? Object.keys(catalog)).slice().sort();
  for (const key of selected) if (!catalog[key]) throw new Error(`Unknown Mona buff: ${key}`);
  const fixtures = skillProbes ?? await probeMonaSkills({ characters: recipients, constellations: [0] });
  const inputs = Object.fromEntries(recipients.map(name => {
    const row = fixtures.rows.find(item => item.character === name && item.constellation === 0 && item.status === 'ok');
    if (!row) throw new Error(`No successful default skill fixture for ${name}`);
    return [name, row.input];
  }));
  const rows = [];
  for (const recipient of recipients) {
    const baseInput = inputs[recipient];
    const baseline = {
      attribute: safeCall(() => api.CommonInterface.get_attribute(structuredClone(baseInput))),
      damage: safeCall(() => api.CalculatorInterface.get_damage_analysis(structuredClone(baseInput), null)),
    };
    for (const key of selected) {
      const fields = catalog[key].config ?? [];
      const defaults = { ...Object.fromEntries(fields.map(field => [field.name, structuredClone(field.default)])), ...params };
      const cases = [{ id: 'default', params: defaults }];
      if (vary) for (const field of fields) {
        const value = alternate(field);
        if (value !== null && !Object.is(value, defaults[field.name])) cases.push({ id: `vary:${field.name}`, params: { ...defaults, [field.name]: value }, varied: { field: field.name, from: defaults[field.name], to: value } });
      }
      let defaultCalls, defaultDiagnostic;
      for (const scenario of cases) {
        const buff = namedBuff(key, scenario.params);
        const input = { ...baseInput, buffs: [buff] };
        const locked = { ...baseInput, buffs: [{ ...buff, lock: true }] };
        const calls = {
          attribute: safeCall(() => api.CommonInterface.get_attribute(structuredClone(input))),
          damage: safeCall(() => api.CalculatorInterface.get_damage_analysis(structuredClone(input), null)),
          lockedAttribute: safeCall(() => api.CommonInterface.get_attribute(structuredClone(locked))),
          lockedDamage: safeCall(() => api.CalculatorInterface.get_damage_analysis(structuredClone(locked), null)),
        };
        const comparison = {};
        for (const [field, reference] of [['attribute', 'attribute'], ['damage', 'damage'], ['lockedAttribute', 'attribute'], ['lockedDamage', 'damage']]) {
          const result = calls[field], original = baseline[reference];
          comparison[field] = result.status === 'ok' && original.status === 'ok'
            ? { status: 'ok', changes: differences(original.value, result.value) }
            : { status: 'error', error: result.error ?? original.error, baselineError: original.error ?? null };
        }
        const diagnostic = classifyMonaBuffDiagnostic(key, recipient, scenario.params, comparison);
        if (scenario.id === 'default') {
          defaultCalls = calls;
          defaultDiagnostic = diagnostic;
        }
        else {
          comparison.variationFromDefault = {};
          for (const field of ['attribute', 'damage']) {
            const reference = defaultCalls[field], current = calls[field];
            comparison.variationFromDefault[field] = reference.status === 'ok' && current.status === 'ok'
              ? { status: 'ok', changes: differences(reference.value, current.value) }
              : current.status === 'ok' && defaultDiagnostic?.kind === 'invalid-input'
                ? { status: 'blocked', baselineError: reference.error, diagnostic: defaultDiagnostic }
              : { status: 'error', error: current.error ?? reference.error };
          }
        }
        rows.push({ id: `mona:buff-probe:${key}:${recipient}:${scenarioPrefix}${scenario.id}`, buffId: `mona:buff:${key}`, recipient, skill: baseInput.skill, scenario: { ...scenario, context: scenarioPrefix || null }, input, comparison, diagnostic });
      }
    }
  }
  // The catalog defaults deliberately contain an unselected reaction for Durin;
  // Linnea's direct-hit mode is valid only on Linnea herself. Keep the original
  // failed observations and add separately identified valid contexts.
  if (contextual) {
    for (const spec of [
      { keys: ['DurinC2', 'DurinTalent2'], recipients, params: { reaction_element: 1 }, scenarioPrefix: 'reaction-dendro:', skillProbes },
      { keys: ['LinneaC1'], recipients: ['Linnea'], params: { hit_mode: 1 }, scenarioPrefix: 'linnea-direct:' },
    ]) {
      const available = spec.keys.filter(key => selected.includes(key));
      if (!available.length) continue;
      const extra = await probeMonaBuffs({ ...spec, keys: available, vary, contextual: false });
      rows.push(...extra.rows);
    }
    for (const recipient of recipients) {
      const prefix = `mona:buff-probe:DurinC2:${recipient}:reaction-dendro:`;
      const enabled = rows.find(row => row.id === prefix + 'default');
      const disabled = rows.find(row => row.id === prefix + 'vary:effect_active');
      if (!enabled || !disabled || enabled.comparison.attribute.status !== 'ok' || disabled.comparison.attribute.status !== 'ok') continue;
      const changes = enabled.comparison.attribute.changes.filter(change => (change.before === null || typeof change.before === 'number') && typeof change.after === 'number');
      enabled.behaviorEvidence = changes.map(change => {
        const inactive = disabled.comparison.attribute.changes.find(item => item.path === change.path);
        return { id: `${enabled.id}:attribute:${change.path}`, side: 'mona', source: 'DurinC2', recipient,
          scope: 'Dendro reaction selected; this recipient and default skill fixture only', attributePath: change.path,
          before: change.before, enabled: change.after, disabled: inactive ? inactive.after : change.before,
          disabledProbeId: disabled.id, status: 'observed' };
      });
    }
  }
  return {
    source: '.references/mona-community/beta-tools/runtime-7106.mjs', fixtures: inputs, rows,
    limitations: [
      'The selected default recipients and skills exercise only specific scope and timing; zero change does not establish that a buff has no effect.',
      'Each variation changes one declared field to a mechanically chosen alternative; invalid alternatives are retained as errors, and combinations and recipient conditions remain open.',
      'The compared panel and damage outputs can omit native or specialized effects; matching numeric outputs are not evidence of equivalent behavior.',
    ],
  };
}

// --- leyline-single-hit-inventory.mjs ---
const folders = { character: 'characters', weapon: 'weapons', set: 'artifact-sets' };
const resonanceFile = 'src/game-data/data/calculation/resonances.json';
const reactionFile = 'src/game-data/data/calculation/reactions.json';
const readData = name => readContentSource(new URL('../../' + name, import.meta.url));

/** Enumerate authored definitions. Presence or a source label does not imply validation. */
export async function leylineSingleHitInventory(entities, clauseInventory) {
  const { isCalculatorCombatModifier } = await loadContentSchema();
  const rows = [];
  function add(kind, entity, revision, field, subject, binding, extra = {}) {
    const document = 'src/game-data/data/' + folders[kind] + '/' + entity + '.json';
    rows.push({ id: kind + ':' + entity + ':' + subject + ':' + field, kind, entity, revision, field,
      subject, source: document + '#' + field, binding, ...extra });
  }
  for (const [kind, group] of [['character', entities.characters], ['weapon', entities.weapons], ['set', entities.sets]]) {
    for (const entity of group) {
      const metadata = entity.metadata ?? entity;
      if (kind === 'character') {
        for (const talent of metadata.talents) for (const { hit, field, unlock } of authoredHitEntries(metadata, talent.id)) {
          const talentIndex = metadata.talents.indexOf(talent);
          const parameters = (Array.isArray(hit.base) ? hit.base : []).flatMap(term => {
            const index = (talent.parameters ?? []).findIndex(parameter => parameter.id === term.parameter);
            return index < 0 ? [] : [{ id: term.parameter, field: '/talents/' + talentIndex + '/parameters/' + index }];
          });
          add(kind, entity.id, entity.revision, field, 'hit', { hitId: hit.id, name: hit.name, skillId: talent.id, skillName: talent.name,
            skillField: '/talents/' + talentIndex, category: hit.category ?? talent.category, element: hit.element ?? talent.element,
            family: hit.family ?? 'ordinary', parameters, definition: hit,
            ref: { definition: { group: 'characters', namespace: metadata.namespace, id: entity.id, revision: entity.revision }, hitId: hit.id }, ...(unlock ? { unlock } : {}) });
        }
      } else {
        const owners = kind === 'weapon' ? [[metadata, '']] : metadata.effects.map((owner, index) => [owner, '/effects/' + index]);
        for (const [owner, field] of owners) for (const [index, hit] of (owner.hits ?? []).entries()) {
          add(kind, entity.id, entity.revision, field + '/hits/' + index, 'equipment-hit', { hitId: hit.id, definition: hit,
            ref: { definition: { group: kind === 'weapon' ? 'weapons' : 'sets', namespace: metadata.namespace, id: entity.id, revision: entity.revision }, hitId: hit.id }, ...(owner.pieces ? { pieces: owner.pieces } : {}) });
        }
      }
      const owners = [[metadata, ''], ...['talents', 'passives', 'constellations', 'effects'].flatMap(group =>
        (metadata[group] ?? []).map((owner, index) => [owner, '/' + group + '/' + index]))];
      for (const [owner, field] of owners) for (const [index, buff] of (owner.buffs ?? []).entries()) {
        for (const [modifierIndex, modifier] of buff.modifiers.entries()) {
          if (!isCalculatorCombatModifier(modifier.target, metadata.calculator?.buffs?.[buff.id])) continue;
          const categoryStacks = (metadata.categoryStacks ?? []).flatMap((rule, index) => {
            if (rule.pieces && rule.pieces !== owner.pieces) return [];
            const reads = [buff.condition,modifier.condition,modifier.value].flatMap(term => conditionFactInputs(term,metadata.facts));
            return reads.some(read => read.key === rule.fact && read.scope === 'owner')
              ? [{rule,source:'/categoryStacks/' + index}] : [];
          });
          add(kind, entity.id, entity.revision, field + '/buffs/' + index + '/modifiers/' + modifierIndex, 'modifier',
            { buffId: buff.id, effectId: modifierIndex ? buff.id + '.' + modifierIndex : buff.id, modifier, buff,
              ...(categoryStacks.length && { categoryStacks }),
              ...(kind === 'set' && owner.pieces ? { pieces: owner.pieces } : {}) });
        }
      }
    }
  }
  const resonances = readData(resonanceFile);
  for (const [field, owner] of [...resonances.resonances.map((owner, index) => ['/resonances/' + index, owner]), ['/gleam', resonances.gleam]]) {
    for (const [i, buff] of (owner.buffs ?? []).entries()) for (const [j, modifier] of buff.modifiers.entries()) {
      if (!isCalculatorCombatModifier(modifier.target)) continue;
      const pointer = field + '/buffs/' + i + '/modifiers/' + j;
      rows.push({ id: 'public:resonances:modifier:' + pointer, kind: 'resonance', entity: 'resonances', field: pointer,
        subject: 'modifier', source: resonanceFile + '#' + pointer, binding: { buffId: buff.id, effectId: j ? buff.id + '.' + j : buff.id, modifier, buff } });
    }
  }
  const reactions = readData(reactionFile);
  for (const [group, items] of Object.entries(reactions.calculation)) {
    if (!Array.isArray(items) || !['formulas', 'tables', 'attributes', 'effects', 'aggregates', 'damageFamilies'].includes(group)) continue;
    for (const [index, definition] of items.entries()) {
      const field = '/calculation/' + group + '/' + index;
      rows.push({ id: 'public:reactions:' + group + ':' + index, kind: 'reaction', entity: 'reactions', revision: reactions.rules?.revision,
        field, subject: 'reaction-' + group, source: reactionFile + '#' + field, binding: definition });
    }
  }
  const bindingRows = new Map(rows.map(row => [row.id, row]));
  const clauseCounts = new Map();
  for (const clause of clauseInventory?.rows ?? []) {
    const key = 'clause:' + clause.kind + ':' + clause.entity + ':' + createHash('sha256').update(JSON.stringify([clause.field, clause.subject, clause.text, clause.name, clause.scope])).digest('hex').slice(0, 20);
    const count = clauseCounts.get(key) ?? 0;
    clauseCounts.set(key, count + 1);
    const subject = clause.subject === 'hit' && clause.kind !== 'character' ? 'equipment-hit' : clause.subject;
    const binding = bindingRows.get(`${clause.kind}:${clause.entity}:${subject}:${clause.field}`);
    if (binding) binding.evidence = { status: clause.status, refs: clause.refs, inputs: clause.inputs,
      comparison: clause.comparison, proofs: clause.proofs };
    rows.push({ id: key + ':' + count, kind: clause.kind, entity: clause.entity,
      revision: clause.revision, field: clause.field, subject: 'clause', source: clause.refs?.[0], clause,
      ...(binding ? { bindingId: binding.id } : {}) });
  }
  const summary = { entities: Object.fromEntries(Object.entries(entities).map(([key, group]) => [key, group.length])),
    bySubject: {} };
  for (const row of rows) summary.bySubject[row.subject] = (summary.bySubject[row.subject] ?? 0) + 1;
  return { rows, summary };
}
