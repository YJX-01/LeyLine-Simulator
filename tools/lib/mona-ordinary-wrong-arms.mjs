import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, novice } from './roster-audit-settings.mjs';
import { ordinaryPanel } from './mona-ordinary-batch.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const official = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592';
const runtime = '.references/mona-community/beta-tools/runtime-7106.mjs';
const axes = { attack: 'atk_ratio', hp: 'hp_ratio', defense: 'def_ratio', elementalMastery: 'em_ratio' };
const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\(第(\d+)击\)/g, '$1').replace(/[^\p{L}\p{N}]/gu, '');
const sum = value => Object.values(value ?? {}).reduce((a, b) => a + b, 0);
const near = (a, b, tolerance = 1e-7) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(resolve(directory, item.name))
    : item.name.endsWith('.rs') ? [resolve(directory, item.name)] : []);
}
function sourceIndex() {
  const index = new Map();
  for (const path of files(resolve(root, '.references/mona-community/mona_core/src/character/characters'))) {
    const text = readFileSync(path, 'utf8');
    for (const match of text.matchAll(/\binternal_name\s*:\s*"([^"]+)"/g)) {
      const list = index.get(match[1]) ?? [];
      list.push({ path: relative(root, path).replaceAll('\\', '/'), text }); index.set(match[1], list);
    }
  }
  return index;
}
function readArm(source, skill) {
  const enums = [...source.text.matchAll(/pub\s+enum\s+(\w+DamageEnum)\s*\{([^}]*)\}/g)];
  if (enums.length !== 1) return null;
  const [, type, body] = enums[0];
  const variants = body.split(',').map(item => item.trim()).filter(Boolean);
  if (variants.some(item => !/^[A-Za-z_]\w*$/.test(item))) return null;
  const variant = variants[skill.index];
  if (!variant) return null;
  const mapRe = new RegExp('CharacterSkillMapItem\\s*\\{\\s*index:\\s*' + escape(type) + '::' + escape(variant) + '\\s+as\\s+usize\\s*,\\s*text:');
  if (!mapRe.test(source.text)) return null;
  const armRe = new RegExp('\\b' + escape(variant) + '\\s*=>\\s*([A-Z][A-Z0-9_]*)\\.([a-zA-Z0-9_]+)\\[s([123])\\]', 'g');
  const arms = [...source.text.matchAll(armRe)];
  if (arms.length !== 1) return null;
  const arm = arms[0], [, constant, field, group] = arm;
  const declaration = new RegExp('pub\\s+const\\s+' + escape(constant) + '\\s*:[^=]+=[^{]+\\{([\\s\\S]*?)\\n\\};').exec(source.text);
  if (!declaration) return null;
  const values = new RegExp('\\b' + escape(field) + '\\s*:\\s*\\[([^\\]]+)\\]').exec(declaration[1]);
  if (!values) return null;
  const table = values[1].split(',').map(value => Number(value.trim())).filter(Number.isFinite);
  if (table.length < 10) return null;
  const line = source.text.slice(0, arm.index).split('\n').length;
  return { variant, constant, field, group: Number(group), table, line, expression: arm[0], path: source.path };
}

/** Strict source-verified wrong-arm findings; all remaining candidates stay open. */
export async function auditMonaWrongOrdinaryArms(monaRows, leylineRows, candidates, scaling, entities, engine) {
  const stats = readContentSource(resolve(root, official + '/stats/talents.json'));
  const identityFile = 'tools/data/sources/catalog/mona-community/catalog.json';
  const identityRows = readContentSource(resolve(root, identityFile)).characters;
  const identities = new Map(identityRows.flatMap((row, index) => [row.monaKey, row.exportName].filter(Boolean)
    .map(name => [name, { row, ref: `${identityFile}#/characters/${index}` }])));
  const source = sourceIndex(), targets = new Map(leylineRows.map(row => [row.id, row]));
  const characters = new Map(entities.characters.map(row => [row.id, row]));
  const weapons = new Map(entities.weapons.map(row => [row.id, row]));
  const branches = new Map(monaRows.filter(row => row.kind === 'output-branch' && row.branch === 'normal' && row.output === 'damage'
    && row.scenario?.id === 'default' && row.scenario?.constellation === 0).map(row => [row.parentId, row]));
  const byScaling = new Map(scaling.rows.filter(row => row.status === 'scaling-mismatch').map(row => [`${row.mona}\0${row.leyline}`, row]));
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const rows = [], mappings = [];
  const summary = { monaSkills: 0, exactUnique: 0, scalingMismatch: 0, sourceArm: 0, officialTable: 0, reviewed: 0 };
  for (const skill of monaRows.filter(row => row.kind === 'skill')) {
    summary.monaSkills++;
    const names = new Set(skill.occurrences.filter(row => !/\/\s*\d/.test(row.label ?? '')).map(row => norm(row.label)).filter(Boolean));
    const exact = (candidates.get(skill.id) ?? []).map(entry => targets.get(typeof entry === 'string' ? entry : entry.id)).filter(hit => hit?.subject === 'hit'
      && hit.binding.family === 'ordinary' && names.has(norm(hit.binding.name)));
    if (exact.length !== 1) continue;
    summary.exactUnique++;
    const hit = exact[0], mismatch = byScaling.get(`${skill.id}\0${hit.id}`), branch = branches.get(skill.id);
    if (!mismatch || !branch) continue;
    summary.scalingMismatch++;
    const record = { mona: skill.id, leyline: hit.id, status: 'unavailable' }; rows.push(record);
    const binding = hit.binding, definition = binding.definition, terms = definition.base;
    const identity = identities.get(skill.character);
    if (!identity || identity.row.canonicalId !== hit.entity) continue;
    const group = Number(binding.skillField.split('/').at(-1)) + 1;
    if (!skill.occurrences.some(row => row.group === group) || definition.when || definition.selection || definition.elementBy || definition.infusion || definition.snapshot
      || binding.unlock || !Array.isArray(terms) || terms.length !== 1 || !axes[terms[0].stat]
      || !terms[0].parameter || Object.keys(terms[0]).some(key => !['stat', 'parameter'].includes(key))) continue;
    const sourceOptions = source.get(skill.character) ?? [];
    const arm = sourceOptions.length === 1 ? readArm(sourceOptions[0], skill) : null;
    if (!arm || arm.group !== group) continue;
    summary.sourceArm++;
    const parameter = terms[0].parameter, table = stats[hit.entity]?.['combat' + group]?.[parameter];
    const character = characters.get(hit.entity), talent = character?.talents.find(row => row.id === binding.skillId);
    const actualHit = talent?.hits.find(row => row.id === binding.hitId), authored = talent?.parameters.find(row => row.id === parameter)?.values;
    const text = official + '/ChineseSimplified/talents/' + hit.entity + '.json';
    const weapon = weapons.get(novice[character?.identity?.weaponType]);
    if (!Array.isArray(table) || !authored || !weapon || !actualHit || !existsSync(resolve(root, text))
      || table.length < 15 || authored.length < 15 || arm.table.length < 15
      || !table.slice(0, 15).every((value, index) => near(value, authored[index]))) continue;
    summary.officialTable++;
    record.arm = arm; record.cases = []; record.ratios = [];
    try {
      for (let level = 1; level <= 15; level++) {
        const input = structuredClone(branch.scenario.input);
        input.character.skill1 = input.character.skill2 = input.character.skill3 = level - 1;
        const result = api.CalculatorInterface.get_damage_analysis(input, null);
        const axis = axes[terms[0].stat], ratio = sum(result[axis]);
        const other = Object.values(axes).filter(name => name !== axis).every(name => near(sum(result[name]), 0));
        if (!other || !near(sum(result.extra_damage), 0) || result.is_heal || result.is_shield
          || String(result.element).toLowerCase() !== binding.element || !near(ratio, arm.table[level - 1], .000001)) throw new Error('Runtime does not isolate source arm');
        if (Math.abs(ratio - table[level - 1]) <= .001) throw new Error('Difference is too small for a wrong-arm finding');
        record.ratios.push({ level, mona: ratio, rust: arm.table[level - 1], official: table[level - 1] });
        if (![1, 6, 10].includes(level)) continue;
        const build = { ...auditBuild(character, weapon), level: 90, ascension: 6, talents: { normal: level, skill: level, burst: level } };
        const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
        if (!prepared.ok) throw new Error('Build preparation failed');
        const { setup, request } = auditHit(character, talent, actualHit, 90);
        const evaluated = engine.evaluateStructuredHit(prepared.team, setup, request);
        const actual = evaluated.totals.all.value?.value;
        const { panel, specialized, promotion } = ordinaryPanel(character, weapon);
        const bonus = specialized === binding.element + 'Bonus' ? promotion : 0;
        const expected = panel[terms[0].stat] * table[level - 1] * (1 + bonus) * .45;
        if (!near(actual, expected, Math.max(1e-6, Math.abs(expected) * 1e-6))) throw new Error('LeyLine engine result is unknown or differs from neutral equation');
        record.cases.push({ level, monaRatio: ratio, rustRatio: arm.table[level - 1], officialRatio: table[level - 1], panel, bonus, expected, actual });
      }
      record.status = 'different';
      const statRef = `${official}/stats/talents.json#/${hit.entity}/combat${group}/${parameter}`;
      mappings.push({ id: `ordinary-wrong-arm:${skill.character}:${skill.index}`, disposition: 'different', mona: [skill.id, branch.id],
        leyline: [{ id: hit.id, revision: hit.revision }], explanation: `同一角色、天赋组和唯一名称的单次${binding.element}伤害；Mona 的 ${arm.variant} 分支读取 ${arm.field}，其运行倍率与官方表及 LeyLine 的 ${parameter} 不同。全部15级核对源码与运行倍率，1、6、10级另核对 LeyLine 实际伤害。`,
        sources: [identity.ref, runtime, arm.path + ':' + arm.line, skill.source.path + '#' + skill.source.pointer, text, statRef, hit.source,
          ...binding.parameters.map(item => hit.source.split('#')[0] + '#' + item.field)],
        comparisons: [...record.ratios.map(item => ({ name: `Mona source arm T${item.level}`, expected: item.rust, actual: item.mona, tolerance: .000001 })),
          ...record.cases.map(item => ({ name: `LeyLine official equation T${item.level}`, expected: item.expected, actual: item.actual,
            tolerance: Math.max(1e-6, Math.abs(item.expected) * 1e-6) }))] });
    } catch (error) { record.status = 'unresolved'; record.reason = String(error?.message ?? error); }
  }
  summary.reviewed = mappings.length;
  return { rows, mappings, summary, limitations: ['Only unambiguous exact labels, ordinary unconditional single-term hits and directly readable Rust match arms are included.',
    'Unreviewed rows are not evidence of equality or defects. Official tables, live runtime and the LeyLine engine are separately tested.'] };
}

const rust = '.references/mona-community/mona_core/src/character/characters/anemo/sucrose.rs';
const builder = '.references/mona-community/mona_core/src/damage/complicated_damage_builder.rs';
const visible = '.references/mona-community/src/algorithms/reaction-labels.mjs';
const fixedOpenSkills = [
  { skill: 'mona:skill:Sucrose:8', variant: 'E1', field: 'elemental_skill_dmg1', group: 2, parameter: 'param1' },
  { skill: 'mona:skill:Sucrose:9', variant: 'Q1', field: 'elemental_burst_dmg1', group: 3, parameter: 'param1' },
];

/** Fully close two source-inspected fixed Anemo entries, not their related absorbed hits. */
export async function auditMonaFixedOpenSkills(monaRows, leylineRows, c0, c6) {
  const text = readFileSync(root + rust, 'utf8');
  const builderText = readFileSync(root + builder, 'utf8');
  const damageBody = /fn damage_internal[\s\S]*?\{([\s\S]*?)\n    \}\s*\n\s*fn new_effect/.exec(text)?.[1];
  const elementBody = /pub fn get_element\(&self\) -> Element\s*\{([\s\S]*?)\n    \}/.exec(text)?.[1];
  const sourceIsSimple = damageBody && !/\b(if|config|fumo\s*=|loop|while|for)\b/.test(damageBody)
    && (damageBody.match(/builder\./g) ?? []).length === 2
    && /builder\.add_atk_ratio\("技能倍率",\s*ratio\)/.test(damageBody)
    && /builder\.damage\([\s\S]*?s\.get_element\(\),\s*s\.get_skill_type\(\),[\s\S]*?fumo,\s*\)/.test(damageBody)
    && /E1\s*=>\s*SkillType::ElementalSkill/.test(text)
    && /Q1\s*\|[^=]*=>\s*SkillType::ElementalBurst/.test(text)
    && elementBody && /_\s*=>\s*Element::Anemo/.test(elementBody) && !/\b(E1|Q1)\b/.test(elementBody)
    && /skill == SkillType::NormalAttack \|\| skill == SkillType::ChargedAttack \|\| skill\.is_plunging\(\)/.test(builderText)
    && /element == Element::Pyro \|\| element == Element::Cryo/.test(builderText)
    && /element == Element::Pyro \|\| element == Element::Hydro/.test(builderText)
    && /element != Element::Dendro/.test(builderText) && /element != Element::Electro/.test(builderText);
  const target = new Map(leylineRows.map(row => [row.id, row]));
  const skills = new Map(monaRows.filter(row => row.kind === 'skill').map(row => [row.id, row]));
  const branchRows = monaRows.filter(row => row.kind === 'output-branch' && row.scenario?.id === 'default');
  const c0Reviews = new Map(c0.mappings.map(row => [row.mona.find(id => id.startsWith('mona:skill:')), row]));
  const c6Reviews = new Map(c6.mappings.map(row => [row.mona[0]?.replace(/^mona:branch:(.+?):(\d+):c6:default:normal$/, 'mona:skill:$1:$2'), row]));
  const stats = readContentSource(resolve(root, official + '/stats/talents.json'));
  const [{ api }, { visibleDamageReactionKeys }] = await Promise.all([
    import('../../.references/mona-community/beta-tools/runtime-7106.mjs'),
    import('../../.references/mona-community/src/algorithms/reaction-labels.mjs'),
  ]);
  const rows = [], mappings = [];
  for (const item of fixedOpenSkills) {
    const row = { mona: item.skill, status: 'unavailable', ratios: [] }; rows.push(row);
    const skill = skills.get(item.skill), baseline = c0Reviews.get(item.skill), six = c6Reviews.get(item.skill);
    const open = monaRows.find(entry => entry.kind === 'open' && entry.parentId === item.skill && entry.id.startsWith('mona:open:skill:'));
    const hit = target.get(baseline?.leyline?.[0]?.id);
    const variants = [0, 6].map(constellation => branchRows.filter(entry => entry.parentId === item.skill && entry.scenario.constellation === constellation));
    if (!sourceIsSimple || !skill || !open || !baseline || !six || !hit || six.leyline[0]?.id !== hit.id
      || hit.binding.element !== 'anemo' || hit.binding.family !== 'ordinary' || hit.binding.category !== (item.group === 2 ? 'skill' : 'burst')
      || variants.some(group => group.length !== 1 || group[0].branch !== 'normal' || group[0].output !== 'damage'
        || group[0].scenario.input.skill.config !== 'NoConfig')) continue;
    const sourceArm = readArm({ path: rust, text }, skill);
    const sourceValues = sourceArm?.table;
    const officialValues = stats.sucrose?.['combat' + item.group]?.[item.parameter];
    if (!sourceArm || sourceArm.variant !== item.variant || sourceArm.constant !== 'SUCROSE_SKILL'
      || sourceArm.field !== item.field || sourceArm.group !== item.group || sourceValues.length !== 15
      || !Array.isArray(officialValues) || officialValues.length < 15
      || !Array.isArray(hit.binding.definition.base) || hit.binding.definition.base.length !== 1
      || hit.binding.definition.base[0].stat !== 'attack' || hit.binding.definition.base[0].parameter !== item.parameter) continue;
    try {
      for (let level = 1; level <= 15; level++) for (const [index, group] of variants.entries()) {
        const input = structuredClone(group[0].scenario.input);
        input.character.skill1 = input.character.skill2 = input.character.skill3 = level - 1;
        const result = api.CalculatorInterface.get_damage_analysis(input, null);
        const ratio = sum(result.atk_ratio), expected = sourceValues[level - 1];
        if (visibleDamageReactionKeys(result).join(',') !== 'normal' || result.is_heal || result.is_shield
          || result.element.toLowerCase() !== 'anemo' || Math.abs(sum(result.extra_damage)) > 1e-9
          || ['hp_ratio', 'def_ratio', 'em_ratio'].some(axis => Math.abs(sum(result[axis])) > 1e-9)
          || Math.abs(ratio - expected) > 1e-8 || Math.abs(expected - officialValues[level - 1]) > .000051) throw new Error('Source/runtime/table or visible branch differs');
        row.ratios.push({ constellation: index ? 6 : 0, level, rust: expected, mona: ratio, official: officialValues[level - 1] });
      }
      row.status = 'matched'; row.leyline = hit.id;
      mappings.push({ id: 'fixed-open-sucrose:' + item.variant, disposition: 'matched', mona: [open.id], leyline: baseline.leyline,
        explanation: `该独立${item.group === 2 ? '战技' : '爆发持续'}风伤条目使用固定 ${sourceArm.expression}，函数不读取技能配置；普通输出之外无可见直伤反应分支。两种命座的15级运行倍率、官方表和源码已核对，并复用各自独立引擎数值对照。染色伤害属于其他条目，不在此复核范围。`,
        sources: [...new Set([...baseline.sources, ...six.sources, runtime, visible, builder, rust + ':' + sourceArm.line,
          `${official}/stats/talents.json#/sucrose/combat${item.group}/${item.parameter}`])],
        comparisons: [...row.ratios.flatMap(value => [
          { name: `C${value.constellation} T${value.level} source arm`, expected: value.rust, actual: value.mona, tolerance: 1e-8 },
          { name: `C${value.constellation} T${value.level} official ratio`, expected: value.official, actual: value.rust, tolerance: .000051 },
        ]), ...baseline.comparisons, ...six.comparisons] });
    } catch (error) { row.status = 'unresolved'; row.reason = String(error?.message ?? error); }
  }
  return { rows, mappings, summary: { examined: fixedOpenSkills.length, reviewed: mappings.length, unresolved: rows.length - mappings.length },
    limitations: ['Only the two source-inspected Sucrose Anemo indices are closed.', 'Absorbed element hits and external reaction or infusion contexts are not closed.'] };
}
