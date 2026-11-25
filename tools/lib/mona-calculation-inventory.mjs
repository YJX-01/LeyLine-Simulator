import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
