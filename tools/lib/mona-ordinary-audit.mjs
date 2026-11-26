import { readContentSource } from './content-source.mjs';
import { probeMonaSkills } from './mona-inventory-probes.mjs';
import { auditBuild, auditHit, novice, setGateFacts, number, bool, setAuditDefaults } from './roster-audit-settings.mjs';
import { loadSpecInactiveWindows } from './mona-entity-specs.mjs';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContentSchema } from './load-content-schema.mjs';
import { amplificationFingerprint } from './source-fingerprint.mjs';
import { createHash } from 'node:crypto';

// --- mona-ordinary-scaling.mjs ---
const source = '.references/mona-community/beta-tools/runtime-7106.mjs';
const scalingAxes = { attack: 'atk_ratio', defense: 'def_ratio', hp: 'hp_ratio', elementalMastery: 'em_ratio' };
const normalize = value => String(value ?? '').replace(/[\s·：:，,。()（）]/g, '').toLowerCase();
const sum = object => Object.values(object ?? {}).reduce((total, value) => total + value, 0);
const equal = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.000051;

/** Compare only authored base scaling under Mona's default C0 configuration. */
export async function compareMonaOrdinaryScaling(monaRows, leylineRows, candidates, initialProbes = []) {
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const mona = new Map(monaRows.filter(row => row.kind === 'skill').map(row => [row.id, row]));
  const indexed = new Map(leylineRows.map(row => [row.id, row]));
  const documents = new Map(), probes = new Map(), rows = [];
  const initialBySkill = new Map(initialProbes.filter(row => row.constellation === 0).map(row => [row.skillId, row]));
  const ordered = [...candidates.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'));
  for (const [skillId, hits] of ordered) {
    const skill = mona.get(skillId);
    if (!skill) continue;
    const candidateRows = hits.map(hit => typeof hit === 'string' ? indexed.get(hit)
      : indexed.get(hit.id) ?? (hit.binding ? hit : undefined)).filter(Boolean);
    if (!candidateRows.length) continue;
    const initial = initialBySkill.get(skillId) ?? (await probeMonaSkills({ characters: [skill.character], indices: [skill.index], constellations: [0] })).rows[0];
    for (const hit of candidateRows) {
      const out = { mona: skillId, leyline: hit.id, entity: hit.entity, revision: hit.revision, field: hit.field,
        source: hit.source, monaSource: skill.source, method: 'default-c0-scaling-only', status: 'unavailable', levels: [] };
      rows.push(out);
      const binding = hit.binding, definition = binding?.definition, terms = definition?.base;
      const groups = [...new Set((skill.occurrences ?? []).map(item => item.group))];
      const expectedGroup = ({ normal: 1, charged: 1, plunge: 1, skill: 2, burst: 3 })[binding?.category];
      const labels = (skill.occurrences ?? []).map(item => normalize(item.label));
      out.labelMatch = labels.includes(normalize(binding?.name));
      const talentGroup = Number(binding?.skillField?.split('/').at(-1)) + 1;
      if (!expectedGroup || !groups.some(group => group === expectedGroup || group === talentGroup)) { out.reason = 'skill-group-mismatch'; continue; }
      if (binding.family !== 'ordinary' || !Array.isArray(terms) || !terms.length || definition.when || definition.selection || binding.unlock) {
        out.reason = 'conditional-or-nonordinary'; continue;
      }
      if (terms.some(term => !scalingAxes[term.stat] || !term.parameter || Object.keys(term).some(key => !['stat', 'parameter'].includes(key)))) {
        out.reason = 'unsupported-base-term'; continue;
      }
      if (initial?.status !== 'ok') { out.reason = 'runtime-initialization-failed'; out.error = initial?.error; continue; }
      if (!documents.has(hit.entity)) documents.set(hit.entity, readContentSource(new URL('../../src/game-data/data/characters/' + hit.entity + '.json', import.meta.url)));
      const document = documents.get(hit.entity);
      const talent = document.talents.find(item => item.id === binding.skillId);
      const params = terms.map(term => talent?.parameters.find(parameter => parameter.id === term.parameter));
      if (params.some(parameter => !parameter || !Array.isArray(parameter.values))) { out.reason = 'missing-parameter'; continue; }
      out.parameters = binding.parameters;
      const maxLevel = Math.min(15, ...params.map(parameter => parameter.values.length));
      for (let level = 1; level <= maxLevel; level++) {
        const key = skillId + ':' + level;
        if (!probes.has(key)) {
          const input = structuredClone(initial.input);
          for (const group of [1, 2, 3]) input.character['skill' + group] = level - 1;
          try { probes.set(key, { result: api.CalculatorInterface.get_damage_analysis(input, null) }); }
          catch (error) { probes.set(key, { error: String(error?.message ?? error) }); }
        }
        const probe = probes.get(key);
        if (probe.error) { out.levels.push({ level, error: probe.error }); continue; }
        const actual = {}, expected = Object.fromEntries(Object.values(scalingAxes).map(axis => [axis, 0]));
        for (const axis of Object.values(scalingAxes)) actual[axis] = sum(probe.result[axis]);
        for (const [index, term] of terms.entries()) expected[scalingAxes[term.stat]] += params[index].values[level - 1];
        const extraDamage = sum(probe.result.extra_damage);
        const element = String(probe.result.element ?? '').toLowerCase();
        const matches = Object.values(scalingAxes).every(axis => equal(actual[axis], expected[axis])) && equal(extraDamage, 0)
          && element === String(binding.element ?? '').toLowerCase() && !probe.result.is_heal && !probe.result.is_shield;
        out.levels.push({ level, actual, expected, extraDamage, element, matches });
      }
      const checked = out.levels.filter(level => !level.error);
      out.status = checked.length === maxLevel && checked.length > 0 && checked.every(level => level.matches) ? 'scaling-match'
        : checked.some(level => !level.matches) ? 'scaling-mismatch' : 'probe-error';
      out.levelCoverage = { checked: checked.length, expected: maxLevel };
      if (out.status === 'scaling-mismatch') out.levels = out.levels.filter(level => level.error || !level.matches).slice(0, 1);
    }
  }
  const summary = {};
  for (const row of rows) summary[row.status] = (summary[row.status] ?? 0) + 1;
  return { source, rows, summary, tolerance: 0.000051, scope: '默认零命配置的技能倍率。匹配项保留全部等级，其他项定位首个差异。同倍率候选仍需区分条件和命中。' };
}

// --- mona-ordinary-batch.mjs ---

export const ordinaryHitName = value => String(value ?? '').normalize('NFKC').toLowerCase()
  .replace(/\(第(\d+)击\)/g, '$1').replace(/[^\p{L}\p{N}]/gu, '');
const batchAxes = { attack: ['atk', 'atk_ratio'], hp: ['hp', 'hp_ratio'], defense: ['def', 'def_ratio'], elementalMastery: ['em', 'em_ratio'] };
const batchNear = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.0001 * Math.max(1, Math.abs(a));
// Explicitly selected inactive, prior-event windows for the no-history baseline.
// Do not default arbitrary facts: many select the requested hit or activate a buff.
const inactiveWindows = new Set([
  'amber.weakPointWindow', 'eula.grimheartShredApplied', 'xiangling.chiliPicked', 'mona.omen',
  'shenhe.burstField', 'shenhe.holdTalisman', 'shenhe.tapTalisman', 'shenhe.quillTap', 'shenhe.quillHold',
  'kujousara.tenguJuuraiRecipient', 'xinyan.sweepingFervorShield', 'mika.soulwindActive',
  'yelan.exquisiteThrowActive', 'aloy.coilAttackWindow', 'beidou.perfectCounterWindow',
  'emilie.targetBurning', 'ningguang.jadeScreenCrossed', 'yunjin.flagFormation', 'diluc.dawnInfusion',
  'tighnari.wreathArrowFired', 'ganyu.celestialShowerArea', 'aether-dendro.lotusField',
  'lumine-dendro.lotusField', 'chiori.geoConstructMade', 'kamisatoayaka.senhoContact', 'sigewinne.restWindow',
  'fischl.hexereiSecretRite', 'fischl.hexereiOverloadActive', 'fischl.hexereiElectroActive', 'fischl.hexereiCoordinationActive',
  'klee.hexereiAwakened', 'klee.chainedSparkAttackActive', 'mona.hexereiAwakened', 'mona.hexereiSecretRite', 'mona.recipientHexerei',
  'vodyanitsa.a4LeadVocal', 'vodyanitsa.a4EnsembleVocal', 'vodyanitsa.a4VortexMode',
  'traveler.enhancedResonance.anemo', 'traveler.enhancedResonance.geo', 'traveler.enhancedResonance.electro',
  'traveler.enhancedResonance.dendro', 'traveler.enhancedResonance.hydro', 'traveler.enhancedResonance.pyro',
  'traveler.enhancedResonance.cryo', 'traveler.enhancedAttribute.first', 'traveler.enhancedAttribute.second',
  'albedo.hexereiSecretRite', 'albedo.hexereiIsotomaWindow', 'albedo.hexereiFumoWindow',
  'albedo.recipientHexerei', 'albedo.fumoPlungeImpactWindow',
]);
export function ordinaryInactiveWindows(character) {
  const extra = loadSpecInactiveWindows(character.id);
  const result = Object.fromEntries(Object.entries(character.metadata.facts ?? {})
    .filter(([key, fact]) => (inactiveWindows.has(key) || extra.has(key)) && fact.type.kind === 'boolean').map(([key]) => [key, false]));
  return result;
}
const baselinePanelLabel = /^(角色基础|武器基础|圣遗物词条|角斗士的终幕礼[24]|角色副属性|初始值)/;
const baselineRatioLabel = /^技能倍率$/;
const tolerance = expected => Math.max(.000001, Math.abs(expected) * .0001);
const close = (expected, actual) => Number.isFinite(expected) && Number.isFinite(actual)
  && Math.abs(expected - actual) <= tolerance(expected);
const ratioClose = (expected, actual) => Number.isFinite(expected) && Number.isFinite(actual)
  && Math.abs(expected - actual) <= Math.max(0.000051, Math.abs(expected) * 0.0001);
export function soloTalentGrants(character, ascension = 6) {
  const grants = { normal: 0, skill: 0, burst: 0 };
  for (const passive of character.passives ?? []) {
    if (ascension < (passive.unlockAscension ?? 0)) continue;
    for (const rule of passive.talentBonuses ?? []) {
      const elements = rule.exactPartyElements;
      if (elements && (elements.length !== 1 || elements[0] !== character.identity.element)) continue;
      grants[rule.category] += rule.levels;
    }
  }
  return grants;
}
const additionalRatioLabel = /(?:^C[1-6]|C[1-6]「|[1-6]命|命座|天赋)/;
const hasAdditionalEffect = analysis => ['atk', 'hp', 'def', 'em', 'bonus', 'atk_ratio', 'def_ratio', 'hp_ratio', 'em_ratio'].some(key => {
  const entries = Object.entries(analysis[key] ?? {}).filter(([, value]) => value !== 0);
  if (!key.endsWith('_ratio')) {
    return entries.some(([label]) => !baselinePanelLabel.test(label));
  }
  return entries.some(([label]) =>
    !baselinePanelLabel.test(label)
    && !baselineRatioLabel.test(label)
    && (additionalRatioLabel.test(label) || entries.length > 1));
});

function ordinaryCommonPanel(analysis, terms, parameters, level) {
  return terms.reduce((total, term) => total + sum(analysis[batchAxes[term.stat][0]])
    * parameters.find(parameter => parameter.id === term.parameter).values[level - 1], 0)
    * (1 + sum(analysis.bonus)) * .45;
}

function defaultBranches(rows, constellation) {
  return new Map(rows.filter(row => row.kind === 'output-branch' && row.branch === 'normal' && row.output === 'damage'
    && row.scenario?.id === 'default' && row.scenario?.constellation === constellation).map(row => [row.parentId, row]));
}

export function ordinaryPanel(character, weapon) {
  const panel = Object.fromEntries(['hp', 'attack', 'defense'].map(stat => [stat,
    character.attributes.base[stat] * character.progression.curves[stat][90] + character.progression.promotion[6][stat]]));
  panel.attack += weapon.baseAttack;
  panel.elementalMastery = character.attributes.base.elementalMastery ?? 0;
  const specialized = character.attributes.specialized, promotion = character.progression.promotion[6].specialized;
  if (specialized === 'elementalMastery') panel.elementalMastery += promotion;
  for (const stat of ['hp', 'attack', 'defense']) if (specialized === stat + 'Percent') panel[stat] *= 1 + promotion;
  return { panel, specialized, promotion };
}

/** Strict, default-C0 single-hit evidence. Unknown gates and ambiguous names remain unresolved. */
export async function auditMonaOrdinaryBatch(monaRows, leylineRows, candidates, scaling, entities, engine) {
  const skills = new Map(monaRows.filter(row => row.kind === 'skill').map(row => [row.id, row]));
  const targets = new Map(leylineRows.map(row => [row.id, row]));
  const characters = new Map(entities.characters.map(row => [row.id, row]));
  const weapons = new Map(entities.weapons.map(row => [row.id, row]));
  const identityFile = 'tools/data/sources/catalog/mona-community/catalog.json';
  const identityCatalog = readContentSource(new URL('../../' + identityFile, import.meta.url)).characters;
  const identities = new Map(identityCatalog.flatMap((row, index) => [row.monaKey, row.exportName]
    .filter(Boolean).map(key => [key, { row, ref: identityFile + '#/characters/' + index }])));
  const formsFile = 'tools/data/sources/character-text/base-and-manekin.json';
  const forms = readContentSource(new URL('../../' + formsFile, import.meta.url)).bindings;
  const travelerFile = 'tools/data/sources/catalog/enka/catalog.json';
  const travelers = new Map(Object.entries(readContentSource(new URL('../../' + travelerFile, import.meta.url)).mapping.characters)
    .map(([key, value]) => [value.id, key]));
  const results = [], mappings = [];
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const defaults = defaultBranches(monaRows, 0);
  const characterProbes = new Map();
  const matchedScaling = new Map(scaling.rows.filter(row => row.status === 'scaling-match').map(row => [`${row.mona}\0${row.leyline}`, row]));
  const choices = [];
  for (const [id, entries] of candidates) {
    const skill = skills.get(id);
    if (!skill) continue;
    // A slash number can mean an aggregate divided by its hit count, not a hit ordinal.
    const names = new Set(skill.occurrences.filter(row => !/\/\s*\d/.test(row.label ?? ''))
      .map(row => ordinaryHitName(row.label)).filter(Boolean));
    const hits = entries.map(entry => targets.get(typeof entry === 'string' ? entry : entry.id)).filter(Boolean)
      .filter(hit => matchedScaling.has(`${id}\0${hit.id}`) && names.has(ordinaryHitName(hit.binding.name)));
    if (hits.length === 1) choices.push({ skill, hit: hits[0] });
  }
  const targetCounts = new Map();
  for (const { hit } of choices) targetCounts.set(hit.id, (targetCounts.get(hit.id) ?? 0) + 1);
  for (const { skill, hit } of choices) {
    if (targetCounts.get(hit.id) !== 1) continue;
    const record = { mona: skill.id, leyline: hit.id, status: 'unavailable', cases: [] };
    results.push(record);
    const identity = identities.get(skill.character);
    const formRef = Object.hasOwn(forms, hit.entity) ? formsFile + '#/bindings/' + hit.entity
      : travelers.has(hit.entity) ? travelerFile + '#/mapping/characters/' + travelers.get(hit.entity) : null;
    const form = /^(Aether|Lumine|Manekina)(Anemo|Cryo|Dendro|Electro|Geo|Hydro|Pyro)$/.exec(skill.character);
    const formId = form && `${form[1]}-${form[2]}`.toLowerCase();
    if (!identity || identity.row.canonicalId !== hit.entity && !(identity.row.canonicalId == null && formRef && formId === hit.entity)) continue;
    const character = characters.get(hit.entity), binding = hit.binding, definition = binding.definition;
    const weapon = weapons.get(novice[character?.identity?.weaponType]);
    const talent = character?.talents.find(row => row.id === binding.skillId);
    const actualHit = talent?.hits.find(row => row.id === binding.hitId);
    if (!weapon || !actualHit || definition.when || definition.selection || definition.elementBy || definition.infusion || definition.snapshot || binding.unlock || !Array.isArray(definition.base) || definition.base.some(term => !batchAxes[term.stat] || !term.parameter || Object.keys(term).some(key => !['stat', 'parameter'].includes(key)))) continue;
    try {
      let branch = defaults.get(skill.id);
      if (!branch) {
        if (!characterProbes.has(skill.character)) characterProbes.set(skill.character, await probeMonaSkills({ characters: [skill.character], constellations: [0] }));
        const probe = characterProbes.get(skill.character).rows.find(row => row.skillId === skill.id && row.status === 'ok');
        if (!probe) throw new Error('Mona default probe unavailable');
        branch = { scenario: { input: probe.input } };
      }
      record.monaInput = branch.scenario.input;
      const inactive = ordinaryInactiveWindows(character);
      record.leylineInactiveWindows = inactive;
      for (const level of [1, 6, 10]) {
        const input = structuredClone(branch.scenario.input);
        // A single-member build still receives its own unconditional party talent grant.
        // Mona's single-hit API takes effective ranks, whereas LeyLine derives them.
        const grants = soloTalentGrants(character);
        input.character.skill1 = level + grants.normal - 1; input.character.skill2 = level + grants.skill - 1; input.character.skill3 = level + grants.burst - 1;
        const effectiveLevel = level + grants[talent.category];
        const analysis = api.CalculatorInterface.get_damage_analysis(input, null);
        if (!analysis.normal || analysis.is_heal || analysis.is_shield) throw new Error('Mona damage unavailable');
        if (hasAdditionalEffect(analysis)) {
          throw new Error('Mona panel contains an additional effect');
        }
        const monaBase = Object.values(batchAxes).reduce((total, [stat, ratio]) => total + sum(analysis[stat]) * sum(analysis[ratio]), 0) + sum(analysis.extra_damage);
        const monaExpected = monaBase * (1 + sum(analysis.bonus)) * .5 * .9;
        const monaActual = analysis.normal.non_critical;
        const build = { ...auditBuild(character, weapon), level: 90, ascension: 6, talents: { normal: level, skill: level, burst: level } };
        const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
        if (!prepared.ok) throw new Error('Build preparation failed');
        const { setup, request } = auditHit(character, talent, actualHit, 90);
        setGateFacts(character, request.frame, inactive);
        const evaluated = engine.evaluateStructuredHit(prepared.team, setup, request);
        const actual = evaluated.totals.all.value?.value;
        const { panel: values, specialized, promotion } = ordinaryPanel(character, weapon);
        const elementalBonus = specialized === binding.element + 'Bonus' ? promotion : 0;
        const expected = definition.base.reduce((total, term) => total + values[term.stat] * talent.parameters.find(p => p.id === term.parameter).values[effectiveLevel - 1], 0) * (1 + elementalBonus) * .5 * .9;
        // Re-evaluate LeyLine's authored terms on Mona's actual panel and bonus; the
        // independent engine check above retains its own legal build and target.
        const commonActual = ordinaryCommonPanel(analysis, definition.base, talent.parameters, effectiveLevel);
        record.cases.push({ level, effectiveLevel, talentGrants: grants, mona: { expected: monaExpected, actual: monaActual,
          panel: Object.fromEntries(Object.entries(batchAxes).map(([key, [stat, ratio]]) => [key, { stat: sum(analysis[stat]), ratio: sum(analysis[ratio]) }])),
          bonus: sum(analysis.bonus), extraDamage: sum(analysis.extra_damage) }, commonPanel: { expected: monaActual, actual: commonActual },
          leyline: { expected, actual, panel: values, elementalBonus,
          ...(evaluated.requiredInputs?.length ? { requiredInputs: evaluated.requiredInputs } : {}) } });
        if (!batchNear(monaExpected, monaActual)) throw new Error('Mona damage differs from baseline equation');
        if (!batchNear(monaActual, commonActual)) throw new Error('Damage differs on common panel');
        if (!Number.isFinite(actual)) throw new Error('LeyLine damage is unknown');
        if (!batchNear(expected, actual)) throw new Error('LeyLine damage differs from baseline equation');

      }
      record.status = 'matched';
      mappings.push({ id: 'ordinary-batch:' + skill.character + ':' + skill.index, disposition: 'matched', mona: [skill.id, ...(defaults.has(skill.id) ? [defaults.get(skill.id).id] : [])],
        leyline: [{ id: hit.id, revision: hit.revision }], explanation: '默认零命配置下的单次普通伤害；目录身份、唯一名称、元素与全等级倍率一致，分别以各自面板和独立公式核对三个天赋等级。',
        sources: [identity.ref, ...(identity.row.canonicalId == null ? [formRef] : []), skill.source.path + '#' + skill.source.pointer,
          '.references/mona-community/beta-tools/runtime-7106.mjs',
          hit.source, ...binding.parameters.map(parameter => hit.source.split('#')[0] + '#' + parameter.field),
          ...character.passives.flatMap((passive, index) => (passive.talentBonuses ?? []).some(rule => rule.category === talent.category)
            ? [hit.source.split('#')[0] + '#/passives/' + index + '/talentBonuses'] : []),
          ...Object.keys(inactive).map(key => hit.source.split('#')[0] + '#/facts/' + key.replaceAll('~', '~0').replaceAll('/', '~1'))],
        comparisons: record.cases.flatMap(row => [{ name: `Mona level ${row.level}`, ...row.mona, tolerance: Math.max(0.000001, Math.abs(row.mona.expected) * .0001) },
          { name: `Common panel level ${row.level}`, ...row.commonPanel, tolerance: Math.max(0.000001, Math.abs(row.commonPanel.expected) * .0001) },
          { name: `LeyLine level ${row.level}`, ...row.leyline, tolerance: Math.max(0.000001, Math.abs(row.leyline.expected) * .0001) }]) });
    } catch (error) { record.status = 'unresolved'; record.reason = String(error?.message ?? error); }
  }
  return { rows: results, mappings, summary: { eligible: choices.length, reviewed: mappings.length, unresolved: results.length - mappings.length }, limitations: ['Only the default C0 configuration and an unconditional single hit are covered.', 'Exact name and scaling cannot prove undocumented mechanics; ambiguous identities remain unresolved.'] };
}

/** C6 default branch validation of already reviewed C0 pairs only. */
export async function auditMonaOrdinaryC6(monaRows, leylineRows, c0, entities, engine) {
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const targets = new Map(leylineRows.map(row => [row.id, row]));
  const characters = new Map(entities.characters.map(row => [row.id, row]));
  const weapons = new Map(entities.weapons.map(row => [row.id, row]));
  const branches = defaultBranches(monaRows, 6);
  const c0rows = new Map(c0.rows.filter(row => row.status === 'matched').map(row => [row.mona + '\0' + row.leyline, row]));
  const mappings = [], rows = [];
  for (const c0review of c0.mappings) {
    const skill = c0review.mona.find(id => id.startsWith('mona:skill:'));
    const targetId = c0review.leyline.length === 1 && c0review.leyline[0].id;
    const base = c0rows.get(skill + '\0' + targetId), hit = targets.get(targetId), branch = branches.get(skill);
    const record = { mona: skill, leyline: targetId, branch: branch?.id ?? null, status: 'unavailable', cases: [] };
    rows.push(record);
    if (!base || !hit || !branch) { record.reason = 'Missing reviewed C0 pair or C6 default damage branch'; continue; }
    const binding = hit.binding, definition = binding.definition, character = characters.get(hit.entity);
    const weapon = weapons.get(novice[character?.identity?.weaponType]);
    const talent = character?.talents.find(row => row.id === binding.skillId);
    const actualHit = talent?.hits.find(row => row.id === binding.hitId);
    const terms = definition?.base;
    if (!character || !weapon || !talent || !actualHit || !Array.isArray(terms) || !terms.length
      || terms.some(term => !batchAxes[term.stat] || !term.parameter || Object.keys(term).some(key => !['stat', 'parameter'].includes(key)))) {
      record.reason = 'Unsupported hit'; continue;
    }
    const bonuses = Object.fromEntries(['normal', 'skill', 'burst'].map(category => [category,
      character.constellations.filter(item => item.rank <= 6).flatMap(item => item.talentBonuses ?? [])
        .filter(bonus => bonus.category === category).reduce((n, bonus) => n + bonus.levels, 0)]));
    const grants = soloTalentGrants(character);
    record.talentBonuses = bonuses; record.talentGrants = grants; record.monaInput = branch.scenario.input;
    record.leylineInactiveWindows = base.leylineInactiveWindows ?? {};
    try {
      // Mona's saved C6 default uses displayed T10 directly; LeyLine's build
      // stores pre-constellation levels, so subtract the declared rank bonuses.
      for (const level of [4, 7, 10]) {
        const input = structuredClone(branch.scenario.input);
        for (const [group, category] of [[1, 'normal'], [2, 'skill'], [3, 'burst']]) {
          if (level - bonuses[category] - grants[category] < 1) throw new Error('C6 base talent level would be invalid');
          input.character['skill' + group] = level - 1;
        }
        const analysis = api.CalculatorInterface.get_damage_analysis(input, null);
        if (!analysis.normal || analysis.is_heal || analysis.is_shield || String(analysis.element).toLowerCase() !== binding.element) {
          throw new Error('Mona C6 output is not the same ordinary damage element');
        }
        if (hasAdditionalEffect(analysis)) throw new Error('Mona C6 panel contains an additional effect');
        const effectiveLevel = level;
        const ratios = Object.fromEntries(Object.keys(batchAxes).map(key => [key, 0]));
        for (const term of terms) ratios[term.stat] += talent.parameters.find(p => p.id === term.parameter)?.values[effectiveLevel - 1] ?? NaN;
        if (Object.entries(batchAxes).some(([stat, [, ratio]]) => !ratioClose(ratios[stat], sum(analysis[ratio]))) || !close(0, sum(analysis.extra_damage))) {
          throw new Error('C6 scaling differs after talent-rank alignment');
        }
        const monaExpected = Object.values(batchAxes).reduce((total, [stat, ratio]) => total + sum(analysis[stat]) * sum(analysis[ratio]), 0)
          * (1 + sum(analysis.bonus)) * .45;
        const commonActual = Object.entries(batchAxes).reduce((total, [stat, [key]]) => total + sum(analysis[key]) * ratios[stat], 0)
          * (1 + sum(analysis.bonus)) * .45;
        const ratioRoundingBound = Object.entries(batchAxes).reduce((total, [stat, [key]]) => total + (ratios[stat] > 0 ? sum(analysis[key]) * 0.000051 : 0), 0)
          * (1 + sum(analysis.bonus)) * .45;
        const monaActual = analysis.normal.non_critical;
        if (level === 10 && (!Number.isFinite(branch.result.non_critical) || Math.abs(branch.result.non_critical - monaActual) > 1e-9
          || ['skill1', 'skill2', 'skill3'].some(key => input.character[key] !== branch.scenario.input.character[key]))) {
          throw new Error('C6 stored default branch differs from the unaltered level-10 input');
        }
        if (!close(monaExpected, monaActual) || !Number.isFinite(commonActual) || Math.abs(monaActual - commonActual) > Math.max(tolerance(monaActual), ratioRoundingBound)) throw new Error('C6 Mona or common-panel damage differs');
        const build = { ...auditBuild(character, weapon), level: 90, ascension: 6, constellation: 6,
          talents: Object.fromEntries(['normal', 'skill', 'burst'].map(category => [category, level - bonuses[category] - grants[category]])) };
        const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
        if (!prepared.ok) throw new Error('C6 build preparation failed');
        const { setup, request } = auditHit(character, talent, actualHit, 90);
        setGateFacts(character, request.frame, record.leylineInactiveWindows);
        const evaluated = engine.evaluateStructuredHit(prepared.team, setup, request);
        const actual = evaluated.totals.all.value?.value;
        const { panel, specialized, promotion } = ordinaryPanel(character, weapon);
        const elementalBonus = specialized === binding.element + 'Bonus' ? promotion : 0;
        const expected = Object.entries(ratios).reduce((total, [stat, ratio]) => total + panel[stat] * ratio, 0) * (1 + elementalBonus) * .45;
        record.cases.push({ level, effectiveLevel, input: { skill1: input.character.skill1, skill2: input.character.skill2, skill3: input.character.skill3 },
          mona: { expected: monaExpected, actual: monaActual, panel: Object.fromEntries(Object.entries(batchAxes).map(([key, [stat]]) => [key, sum(analysis[stat])])), bonus: sum(analysis.bonus) },
          ...(level === 10 ? { storedBranch: { expected: branch.result.non_critical, actual: monaActual } } : {}),
          commonPanel: { expected: monaActual, actual: commonActual }, leyline: { expected, actual, panel, elementalBonus,
            ...(evaluated.requiredInputs?.length ? { requiredInputs: evaluated.requiredInputs } : {}) } });
        if (!Number.isFinite(actual)) throw new Error('C6 LeyLine damage is unknown');
        if (!close(expected, actual)) throw new Error('C6 LeyLine damage differs from neutral equation');
      }
      record.status = 'matched';
      const bonusSources = character.metadata.constellations.flatMap((entry, i) => entry.talentBonuses?.length
        ? [hit.source.split('#')[0] + '#/constellations/' + i + '/talentBonuses'] : []);
      mappings.push({ id: c0review.id.replace('ordinary-batch:', 'ordinary-c6:'), disposition: 'matched', mona: [branch.id], leyline: c0review.leyline,
        explanation: '同一命中在默认六命、无额外主动效果和指定中性历史事实下复核；对齐命座赋予的天赋等级后，三档分别核对 Mona 实际结果、同面板倍率公式和 LeyLine 六命引擎结果。',
        sources: [...new Set([...c0review.sources, ...bonusSources])],
        comparisons: record.cases.flatMap(row => [
          { name: `C6 Mona T${row.level}`, ...row.mona, tolerance: tolerance(row.mona.expected) },
          ...(row.storedBranch ? [{ name: 'C6 stored default branch', ...row.storedBranch, tolerance: 1e-9 }] : []),
          { name: `C6 common panel T${row.level}`, ...row.commonPanel, tolerance: tolerance(row.commonPanel.expected) },
          { name: `C6 LeyLine T${row.level}`, ...row.leyline, tolerance: tolerance(row.leyline.expected) },
        ]) });
    } catch (error) { record.status = 'unresolved'; record.reason = String(error?.message ?? error); }
  }
  const summary = { eligibleC0Pairs: c0.mappings.length, reviewedC6Branches: mappings.length, unresolvedC6Branches: rows.length - mappings.length };
  return { rows, mappings, summary, limitations: ['C6 default configurations only; no claim is made about intermediate constellations.',
    'Rows with active effects, unknown facts or damage differences remain open.'] };
}

// --- mona-common-input-batch.mjs ---
const rollSource = 'src/game-data/data/tables/artifact-rolls.json';
const upstreamRollSource = 'tools/data/sources/lunagc/b0501c5d89767ead5f647869a2412521447f7682/ReliquaryAffixExcelConfigData.json';
const rolls = readContentSource(new URL('../../' + rollSource, import.meta.url)).affixes;
const talentSource = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/stats/talents.json';
const growthSource = 'tools/data/sources/catalog/genshin-db/characters.json';
const elementalProperty = { pyro:'FIRE', hydro:'WATER', electro:'ELEC', cryo:'ICE', anemo:'WIND', geo:'ROCK', dendro:'GRASS', physical:'PHYSICAL' };

// Skill identity is reviewed separately. Each case compares one actual default
// damage branch at a recorded, aligned attack panel.
export async function auditMonaCommonInputBranches(monaRows, leylineRows, reviews, entities, engine, { constellation = 0, samples, targetIds } = {}) {
  if (![0, 6].includes(constellation)) throw new Error('Common-input constellation must be 0 or 6');
  if (samples && (!samples.length || !targetIds?.length)) throw new Error('Explicit samples require a nonempty targetIds selection');
  const sourceTalents = samples ? readContentSource(new URL('../../' + talentSource, import.meta.url)) : null;
  const sourceGrowth = samples ? readContentSource(new URL('../../' + growthSource, import.meta.url)) : null;
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const targets = new Map(leylineRows.map(row => [row.id, row]));
  const characters = new Map(entities.characters.map(row => [row.id, row]));
  const weapons = new Map(entities.weapons.map(row => [row.id, row]));
  const set = entities.sets?.find(row => row.id === 'gladiatorsfinale');
  const branches = new Map(monaRows.filter(row => row.kind === 'output-branch' && row.branch === 'normal'
    && row.output === 'damage' && row.scenario?.id === 'default' && row.scenario?.constellation === constellation)
    .map(row => [row.parentId, row]));
  const claimed = new Map();
  for (const review of reviews) for (const id of review.mona ?? []) {
    if (!id.startsWith('mona:branch:')) continue;
    const claims = claimed.get(id) ?? [];
    claims.push(review);
    claimed.set(id, claims);
  }
  const skillTargets = new Map(), targetSkills = new Map();
  for (const review of reviews) {
    const skill = review.mona?.filter(id => id.startsWith('mona:skill:'));
    if (skill?.length !== 1) continue;
    for (const { id: target } of review.leyline ?? []) {
      if (!skillTargets.has(skill[0])) skillTargets.set(skill[0], new Set());
      if (!targetSkills.has(target)) targetSkills.set(target, new Set());
      skillTargets.get(skill[0]).add(target); targetSkills.get(target).add(skill[0]);
    }
  }
  const rows = [], mappings = [];
  const seen = new Set();
  for (const review of reviews) {
    if (review.disposition !== 'matched' || review.leyline.length !== 1) continue;
    const skills = review.mona.filter(id => id.startsWith('mona:skill:'));
    if (skills.length !== 1) continue;
    const branch = branches.get(skills[0]), target = targets.get(review.leyline[0].id);
    if (targetIds && !targetIds.includes(review.leyline[0].id)) continue;
    const binding = target?.binding, def = binding?.definition;
    const c6Review = constellation === 6 && branch && (claimed.get(branch.id) ?? []).find(claim =>
      claim.id === `ordinary-c6:${branch.character}:${branch.index}` && claim.disposition === 'matched'
      && claim.mona?.length === 1 && claim.mona[0] === branch.id && claim.leyline?.length === 1
      && claim.leyline[0].id === target?.id && claim.leyline[0].revision === target?.revision);
    // Ordinary-batch links include both the skill and its default branch, but
    // their panel perturbation is not a same-input LeyLine engine evaluation.
    // Permit that link itself; preserve any independent claim on the branch.
    if (!branch || constellation === 6 && !c6Review
      || (claimed.get(branch.id) ?? []).some(claim => constellation === 6 ? claim !== c6Review : claim !== review
        || review.id !== `ordinary-batch:${branch.character}:${branch.index}`
        || review.mona.length !== 2 || !review.mona.includes(branch.id))
      || !target || review.leyline[0].revision !== target.revision
      || skillTargets.get(skills[0])?.size !== 1 || targetSkills.get(target.id)?.size !== 1 || seen.has(branch.id)
      || target.subject !== 'hit' || !['hit-complete', 'hit-unavailable'].includes(def?.support)
      || binding.family !== 'ordinary' || def.when || def.selection || def.elementBy || def.infusion || def.snapshot
      || binding.unlock || !Array.isArray(def.base) || def.base.some(term => term.stat !== 'attack' || !term.parameter
        || Object.keys(term).some(key => !['stat', 'parameter'].includes(key)))) continue;
    const character = characters.get(target.entity), weapon = weapons.get(novice[character?.identity?.weaponType]);
    const talent = character?.talents.find(item => item.id === binding.skillId);
    const hit = talent?.hits.find(item => item.id === binding.hitId);
    if (!weapon || !talent || !hit || !set) continue;
    seen.add(branch.id);
    const row = { mona: branch.id, leyline: target.id, constellation, sourceReview: review.id,
      ...(c6Review ? { constellationReview: c6Review.id } : {}), status: 'unresolved', cases: [] };
    rows.push(row);
    try {
      const settings = samples ?? ['501051', '501052', '501054'].map(rollId => ({ level:1, ascension:0, talentLevel:1, rollId }));
      for (const { level, ascension, talentLevel, rollId, teamSupport } of settings) {
        if (!Number.isInteger(level) || !Number.isInteger(ascension) || !Number.isInteger(talentLevel)
          || !rolls[rollId] || rolls[rollId].stat !== 'attack' || rolls[rollId].rarity !== 5) throw new Error('Invalid common-input sample');
        const flatAttack = rolls[rollId].value;
        const bonuses = Object.fromEntries(['normal', 'skill', 'burst'].map(category => [category,
          character.constellations.filter(item => item.rank <= constellation).flatMap(item => item.talentBonuses ?? [])
            .filter(bonus => bonus.category === category).reduce((sum, bonus) => sum + bonus.levels, 0)]));
        const grants = soloTalentGrants(character, ascension);
        if (teamSupport && (teamSupport !== 'tartaglia' || !['kaeya', 'amber'].includes(character.id)
          || talent.category !== 'normal' || talentLevel !== 10 || level !== 90 || ascension !== 6)) throw new Error('Unreviewed team talent input');
        const support = teamSupport && characters.get('tartaglia');
        const supportWeapon = teamSupport && weapons.get('huntersbow');
        if (teamSupport && (!support || !supportWeapon)) throw new Error('Tartaglia teammate and weapon are required');
        const input = structuredClone(branch.scenario.input);
        const ascensionLevels = [20, 40, 50, 60, 70, 80];
        const ascend = ascensionLevels[ascension - 1] === level;
        Object.assign(input.character, { level, ascend, constellation,
          skill1: talentLevel + bonuses.normal + grants.normal + (teamSupport ? 1 : 0) - 1,
          skill2: talentLevel + bonuses.skill + grants.skill - 1, skill3: talentLevel + bonuses.burst + grants.burst - 1 });
        Object.assign(input.weapon, { level: 1, ascend: false });
        input.artifacts = []; input.buffs = [];
        const neutral = api.CalculatorInterface.get_damage_analysis(input, null);
        const monaAttack = Object.values(neutral.atk ?? {}).reduce((a, b) => a + b, 0);
        const baseAttack = character.attributes.base.attack * character.progression.curves.attack[level]
          + character.progression.promotion[ascension].attack + weapon.baseAttack;
        const leylineAttack = baseAttack * (1 + (character.attributes.specialized === 'attackPercent'
          ? character.progression.promotion[ascension].specialized : 0));
        const roundingAdjustment = leylineAttack - monaAttack;
        if (!Number.isFinite(roundingAdjustment) || Math.abs(roundingAdjustment) > 1) throw new Error('Base attack panels do not align within rounding');
        input.artifacts = [{ id: 1, set_name: 'GladiatorsFinale', slot: 'Flower', level: 0, star: 5,
          main_stat: ['HPFixed', 717], sub_stats: [['ATKFixed', flatAttack], ['DEFFixed', rolls['501081'].value], ['CriticalRate', rolls['501201'].value]] }];
        input.buffs = [{ name: 'ATKFixed', config: { ATKFixed: { value: roundingAdjustment } } }];
        const mona = api.CalculatorInterface.get_damage_analysis(input, null);
        const achievedMonaAttack = Object.values(mona.atk ?? {}).reduce((a, b) => a + b, 0);
        if (constellation === 6) {
          const effectiveLevel = talentLevel + (bonuses[talent.category] ?? 0) + grants[talent.category] + (teamSupport ? 1 : 0);
          const expectedRatio = def.base.reduce((sum, term) => sum + (talent.parameters.find(parameter => parameter.id === term.parameter)?.values[effectiveLevel - 1] ?? NaN), 0);
          const actualRatio = Object.values(mona.atk_ratio ?? {}).reduce((sum, value) => sum + value, 0);
          const extraDamage = Object.values(mona.extra_damage ?? {}).reduce((sum, value) => sum + value, 0);
          if (!Number.isFinite(expectedRatio) || Math.abs(actualRatio - expectedRatio) > 0.00005 * def.base.length
            || Math.abs(extraDamage) > 1e-9) throw new Error('C6 scaling or extra base damage requires separate review');
        }
        const artifact = { id: 'flower', setId: 'gladiatorsfinale', slot: 'flower', rarity: 5, level: 0, mainStat: 'hp', inventory: null,
          sourceRefs: [], substats: [{ stat: 'attack', value: flatAttack }, { stat: 'defense', value: rolls['501081'].value },
            { stat: 'critRate', value: rolls['501201'].value }] };
        const build = { ...auditBuild(character, weapon, [set]), level, ascension, constellation, artifacts: [artifact], talents: { normal: talentLevel, skill: talentLevel, burst: talentLevel } };
        const team = [{ id: 'actor', build }, ...(teamSupport ? [{ id: 'tartaglia', build: auditBuild(support, supportWeapon) }] : [])];
        const prepared = engine.prepareStructuredBuilds(team);
        if (!prepared.ok) throw new Error('LeyLine build: ' + JSON.stringify(prepared.diagnostics));
        const { setup, request } = auditHit(character, talent, hit, 90);
        const inactiveWindows = ordinaryInactiveWindows(character);
        setGateFacts(character, request.frame, inactiveWindows);
        const evaluated = engine.evaluateStructuredHit(prepared.team, setup, request);
        const attackTrace = evaluated.trace.find(node => node.kind === 'attribute' && node.nodeId === 'attribute.attack' && node.context?.actorId === 'actor');
        const achievedLeylineAttack = attackTrace?.state === 'known' ? attackTrace.value?.value : null;
        const expected = mona.normal?.non_critical, actual = evaluated.totals.all.value?.value;
        const tolerance = Math.max(1e-6, Math.abs(expected) * 0.0002);
        let coefficientEvidence;
        if (samples) {
          const sourceGroup = { normal:'combat1', skill:'combat2', burst:'combat3' }[talent.category];
          const effectiveLevel = talentLevel + (bonuses[talent.category] ?? 0) + grants[talent.category] + (teamSupport ? 1 : 0);
          const terms = def.base.map(term => ({ parameter:term.parameter, value:sourceTalents[character.id]?.[sourceGroup]?.[term.parameter]?.[effectiveLevel - 1],
            source:`${talentSource}#/${character.id}/${sourceGroup}/${term.parameter}/${effectiveLevel - 1}` }));
          const coefficient = terms.reduce((sum, term) => sum + term.value, 0);
          const monaCoefficient = Object.values(mona.atk_ratio ?? {}).reduce((sum, value) => sum + value, 0);
          const growth = sourceGrowth[character.id]?.stats;
          if (!growth?.promotion?.[ascension] || !elementalProperty[binding.element]) throw new Error('Independent elemental bonus source unavailable');
          const expectedBonus = growth.specialized === `FIGHT_PROP_${elementalProperty[binding.element]}_ADD_HURT`
            ? growth.promotion[ascension].specialized : 0;
          const monaBonus = Object.values(mona.bonus ?? {}).reduce((sum, value) => sum + value, 0);
          const independentDamage = achievedLeylineAttack * coefficient * (1 + expectedBonus) * (level + 100) / (level + 290) * 0.9;
          coefficientEvidence = { terms, coefficient, monaCoefficient, independentDamage, expectedBonus, monaBonus,
            bonusSource: `${growthSource}#/${character.id}/stats/promotion/${ascension}/specialized` };
          if (!Number.isFinite(coefficient) || !Number.isFinite(monaCoefficient)
            || Math.abs(monaCoefficient - coefficient) > 0.00005 * terms.length + Number.EPSILON * Math.max(1, Math.abs(coefficient))
            || !Number.isFinite(monaBonus) || Math.abs(monaBonus - expectedBonus) > 1e-9
            || Math.abs(independentDamage - actual) > tolerance) throw new Error('Independent coefficient or damage differs');
        }
        row.cases.push({ level, ascension, constellation, talentLevel, effectiveTalentLevel: talentLevel + (bonuses[talent.category] ?? 0) + grants[talent.category] + (teamSupport ? 1 : 0),
          ...(teamSupport ? { teamSupport: { id: 'tartaglia', source: 'src/game-data/data/characters/tartaglia.json#/passives/2', monaTeamMode: 'effective-rank-only' } } : {}),
          talentBonuses: bonuses, talentGrants: grants, flatAttack, rollId, roundingAdjustment, monaInput: input,
          leylineBuild: { level, ascension, weaponLevel: 1, weaponAscension: 0, talentLevel, artifacts: [artifact], inactiveWindows,
            ...(teamSupport ? { teammate: team[1] } : {}) },
          effectiveAttack: { mona: achievedMonaAttack, leyline: achievedLeylineAttack,
            leylineMethod: 'evaluateStructuredHit attribute.attack trace', leylineTrace: attackTrace },
          target: { level: 90, resistance: 0.1, defenseReduction: 0, ordinaryDamageReduction: 0 },
          element: binding.element, mona: expected, leyline: actual, tolerance, ...(coefficientEvidence && { coefficientEvidence }), requiredInputs: evaluated.requiredInputs });
        if (String(mona.element).toLowerCase() !== binding.element || !Number.isFinite(expected) || !Number.isFinite(actual) || !Number.isFinite(achievedLeylineAttack)
          || Math.abs(achievedMonaAttack - achievedLeylineAttack) > 1e-8
          || Math.abs(expected - actual) > tolerance || evaluated.requiredInputs?.length) throw new Error('Common-input damage, element or required facts differ');
      }
      row.status = 'matched';
      mappings.push({ id: 'common-input:' + branch.character + ':' + branch.index + (constellation === 6 ? ':c6' : ''), disposition: 'matched', coverage: 'scenario', mona: [branch.id], leyline: [review.leyline[0]],
        explanation: `已独立核对命中身份；${constellation}命、${samples ? '指定培养与天赋等级' : '一级'}及指定敌人下，按命座天赋加级对齐天赋，以真实档位副词条设置攻击力，明确关闭记录中的无历史窗口；Mona 另以合成固定攻击增益修正基础值精度差，再由双方运行入口比较非暴击普通伤害。`,
        sources: [...new Set([...review.sources, ...(c6Review?.sources ?? []), target.source, rollSource, upstreamRollSource, 'tools/lib/mona-ordinary-audit.mjs',
          ...(samples ? [talentSource, growthSource] : []), ...(settings.some(sample => sample.teamSupport) ? ['src/game-data/data/characters/tartaglia.json#/passives/2'] : []),
          ...Object.keys(ordinaryInactiveWindows(character)).map(key => target.source.split('#')[0] + '#/facts/' + key.replaceAll('~', '~0').replaceAll('/', '~1'))])],
        comparisons: row.cases.map(item => ({ name: `Level ${item.level}, talent ${item.talentLevel}, attack +${item.flatAttack}`, expected: item.mona, actual: item.leyline, tolerance: item.tolerance })) });
    } catch (error) { row.reason = String(error?.message ?? error); }
  }
  return { rows, mappings, summary: { eligible: rows.length, reviewed: mappings.length, unresolved: rows.length - mappings.length },
    limitations: [`C${constellation} ${samples ? 'selected cultivation and talent levels' : 'level-1'} noncritical normal damage with aligned attack only; other branches, event counts and timing remain open.`,
      ...(samples ? ['Mona receives a synthetic flat-attack correction for panel rounding; it is not a player equipment configuration.',
        'Mona single-hit runtime receives the effective rank; the Tartaglia team grant is evaluated only in LeyLine.'] : [])] };
}

const forms = new Map([
  ['AetherPyro', 'aether-pyro'], ['LuminePyro', 'lumine-pyro'],
  ['AetherCryo', 'aether-cryo'], ['LumineCryo', 'lumine-cryo'],
]);
const travelerSum = values => Object.values(values ?? {}).reduce((a, b) => a + b, 0);
const travelerDepot = { 'aether-pyro': '10000005-502', 'aether-cryo': '10000005-505',
  'lumine-pyro': '10000007-702', 'lumine-cryo': '10000007-705' };
const travelerParameter = 'tools/data/sources/lunagc/b0501c5d89767ead5f647869a2412521447f7682/ProudSkillExcelConfigData.json';
const travelerSourceRows = readContentSource(new URL('../../' + travelerParameter, import.meta.url));

/** Re-run the named traveler first hit with explicit infusion and radiance conditions. */
export async function auditTravelerNormalScenarios(monaRows, leylineRows, entities, engine, { selectedSkillIds } = {}) {
  const { api } = await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const rows = [], mappings = [];
  for (const [name, id] of forms) {
    const skill = monaRows.find(row => row.id === `mona:skill:${name}:0`);
    if (selectedSkillIds && !selectedSkillIds.has(`mona:skill:${name}:0`)) continue;
    const branch = monaRows.find(row => row.id === `mona:branch:${name}:0:c0:default:normal`);
    if (!skill || !branch) continue;
    const target = leylineRows.find(row => row.id === `character:${id}:hit:/talents/0/hits/0`);
    const character = entities.characters.find(row => row.id === id);
    const weapon = entities.weapons.find(row => row.id === 'dullblade');
    const talent = character?.talents.find(row => row.id === target?.binding?.skillId);
    const hit = talent?.hits.find(row => row.id === target?.binding?.hitId);
    for (const infusion of name.endsWith('Cryo') ? [false, true] : [false]) {
      const row = { mona: skill.id, branch: branch.id, leyline: target?.id, infusion, status: 'unresolved' };
      rows.push(row);
      try {
        const definition = target?.binding?.definition;
        if (!character || !weapon || !hit || skill.character !== name || target.entity !== id
          || skill.occurrences.length !== 1 || skill.occurrences[0].group !== 1
          || skill.occurrences[0].label !== definition?.name || definition.name !== '一段伤害'
          || definition.base?.length !== 1 || definition.base[0].stat !== 'attack'
          || definition.base[0].parameter !== 'param1' || !hit.infusion?.fact) throw new Error('Traveler identity or first-hit binding changed');
        const level = infusion ? 20 : 1, ascension = infusion ? 1 : 0;
        const input = structuredClone(branch.scenario.input);
        Object.assign(input.character, { level, ascend: Boolean(ascension), constellation: 0, skill1: 0, skill2: 0, skill3: 0 });
        Object.assign(input.weapon, { level: 1, ascend: false, refine: 1 });
        input.artifacts = []; input.buffs = [];
        if (name.endsWith('Cryo')) {
          input.character.params[name] = { cold_glow_stacks: 0, radiance_mode: infusion ? 1 : 0, c2_em_state: 0 };
          input.skill.config[name].e_infusion = infusion;
        }
        const neutral = api.CalculatorInterface.get_damage_analysis(input, null);
        const build = { ...auditBuild(character, weapon), level, ascension };
        const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
        if (!prepared.ok) throw new Error('LeyLine build: ' + JSON.stringify(prepared.diagnostics));
        const { setup, request } = auditHit(character, talent, hit, 90);
        setGateFacts(character, request.frame, ordinaryInactiveWindows(character));
        request.frame.factOverrides[0].facts[hit.infusion.fact].value.value = infusion;
        const result = engine.evaluateStructuredHit(prepared.team, setup, request);
        const trace = result.trace.find(node => node.kind === 'attribute' && node.nodeId === 'attribute.attack' && node.context?.actorId === 'actor');
        const attack = trace?.state === 'known' ? trace.value?.value : null;
        const adjustment = attack - travelerSum(neutral.atk);
        if (!Number.isFinite(adjustment) || Math.abs(adjustment) > 1) throw new Error('Base attack panels do not align within rounding');
        input.buffs = [{ name: 'ATKFixed', config: { ATKFixed: { value: adjustment } } }];
        const mona = api.CalculatorInterface.get_damage_analysis(input, null);
        const expected = mona.normal?.non_critical, actual = result.totals.all.value?.value;
        const tolerance = Math.max(1e-6, Math.abs(expected) * 0.0002);
        const element = infusion ? 'cryo' : 'physical';
        const sourceIndex = name.startsWith('Aether') ? 429 : 444;
        const coefficient = travelerSourceRows[sourceIndex]?.paramList?.[0];
        const independent = attack * (coefficient + (infusion ? 0.8 : 0)) * ((level + 100) / (level + 290)) * 0.9;
        Object.assign(row, { level, ascension, input, attack: { mona: travelerSum(mona.atk), leyline: attack, adjustment },
          element, expected, actual, tolerance, independent, coefficient, monaRatio: travelerSum(mona.atk_ratio), requiredInputs: result.requiredInputs,
          sources: [skill.source.path + '#' + skill.source.pointer, target.source,
            target.source.split('#')[0] + '#' + target.binding.parameters[0].field,
            `tools/data/sources/catalog/enka/catalog.json#/mapping/characters/${travelerDepot[id]}`,
            `${travelerParameter}#/${sourceIndex}`, 'tools/data/sources/character-text/traveler-normal-units.json',
            'tools/lib/mona-ordinary-audit.mjs'] });
        if (String(mona.element).toLowerCase() !== element || !Number.isFinite(expected) || !Number.isFinite(actual)
          || Math.abs(travelerSum(mona.atk) - attack) > 1e-8 || Math.abs(expected - actual) > tolerance
          || coefficient !== 0.44462 || Math.abs(travelerSum(mona.atk_ratio) - coefficient) > 0.00005
          || Math.abs(actual - independent) > 1e-6
          || result.requiredInputs?.length) throw new Error('Element, aligned attack, damage or required inputs differ');
        row.status = 'matched';
        mappings.push({ id: `traveler-normal:${name}:0:${infusion ? 'cryo-infused' : 'physical'}`, disposition: 'matched', coverage: 'scenario',
          mona: [skill.id, ...(name.endsWith('Pyro') ? [branch.id] : [])], leyline: [{ id: target.id, revision: target.revision }],
          explanation: `零命首击，${level}级突破${ascension}，${infusion ? '星超导辉映、冰附魔开启且寒辉零层' : '附魔关闭'}；对齐双方攻击力后比较非暴击伤害。仅覆盖本场景。`,
          sources: row.sources, comparisons: [{ name: 'Aligned attack, noncritical', expected, actual, tolerance },
            { name: 'Independent source coefficient and defense equation', expected: independent, actual, tolerance: 1e-6 }] });
      } catch (error) { row.reason = String(error?.message ?? error); }
    }
  }
  return { rows, mappings, summary: { checked: rows.length, matched: rows.filter(row => row.status === 'matched').length },
    limitations: ['Explicit C0 first-hit scenarios only; cryo default with nonzero cold glow stacks is not covered.',
      'The attack adjustment aligns panel rounding and is not a player equipment configuration.'] };
}

// --- mona-ordinary-wrong-arms.mjs ---
const root = fileURLToPath(new URL('../../', import.meta.url));
const official = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592';
const runtime = '.references/mona-community/beta-tools/runtime-7106.mjs';
const wrongArmAxes = { attack: 'atk_ratio', hp: 'hp_ratio', defense: 'def_ratio', elementalMastery: 'em_ratio' };
const norm = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/\(第(\d+)击\)/g, '$1').replace(/[^\p{L}\p{N}]/gu, '');

const wrongArmNear = (a, b, tolerance = 1e-7) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
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

/** Two source-confirmed duplicate menu bindings; one actual hit from each adjacent pair. */
export async function auditMonaDuplicateMenuArms(monaRows, leylineRows, entities, engine, { selectedSkillIds } = {}) {
  const specs=[
    {name:'Citlali',id:'citlali',weapon:'apprenticesnotes',index:10,skill:'citlali.burst',hits:['citlali.burst.param1','citlali.burst.param2'],
      target:'character:citlali:hit:/talents/2/hits/1',source:'.references/mona-community/mona_core/src/character/characters/cryo/citlali.rs',
      needles:['Q1 locale!(zh_cn: "冰风暴伤害"','Q1 locale!(zh_cn: "宿灵之髑伤害"','Q2 => CITLALI_SKILL.q_dmg2[s3]'],group:'combat3',params:['param1','param2']},
    {name:'KaedeharaKazuha',id:'kaedeharakazuha',weapon:'dullblade',index:6,skill:'kaedeharakazuha.normal',hits:['kaedeharakazuha.normal.param7','kaedeharakazuha.normal.param8'],
      target:'character:kaedeharakazuha:hit:/talents/0/hits/7',source:'.references/mona-community/mona_core/src/character/characters/anemo/kaedehara_kazuha.rs',
      needles:['KaedeharaKazuhaDamageEnum::Charged11 as usize, text: locale!(zh_cn: "重击伤害-1"','KaedeharaKazuhaDamageEnum::Charged11 as usize, text: locale!(zh_cn: "重击伤害-2"','Charged12 => KAEDEHARA_KAZUHA_SKILL.charged_dmg12[s1]'],group:'combat1',params:['param7','param8']},
  ];
  const selected=specs.filter(spec=>!selectedSkillIds || selectedSkillIds.has(`mona:skill:${spec.name}:${spec.index}`));
  if(!selected.length)return {rows:[],mappings:[],scope:'No duplicate-menu sample selected.'};
  const {api}=await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const {createEmptyProject}=await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const {addActorFromBuild,addSkillHit,defaultEnemy}=await loadContentSchema('/src/web/src/domain/real-project.ts');
  const stats=readContentSource(resolve(root,official+'/stats/talents.json')),rows=[],mappings=[];
  for(const spec of selected) {
    const character=entities.characters.find(x=>x.id===spec.id),weapon=entities.weapons.find(x=>x.id===spec.weapon);
    const skill=monaRows.find(x=>x.id===`mona:skill:${spec.name}:${spec.index}`),branch=monaRows.find(x=>x.id===`mona:branch:${spec.name}:${spec.index}:c0:default:normal`);
    const target=leylineRows.find(x=>x.id===spec.target);
    if(!character || !weapon || !skill || !branch || target?.revision!=='3' || target.binding?.hitId!==spec.hits[1])continue;
    const sourceText=readFileSync(resolve(root,spec.source),'utf8');
    if(!spec.needles.every(needle=>sourceText.includes(needle)))throw new Error(spec.name+' duplicate source mapping changed');
    const project=createEmptyProject();project.enemy=defaultEnemy();const actor=addActorFromBuild(project,auditBuild(character,weapon));
    const talent=character.talents.find(x=>x.id===spec.skill);if(!talent)throw new Error('Duplicate-menu talent missing');
    const events=spec.hits.map((id,i)=>{
      const ordinal=talent.hits.findIndex(hit=>hit.id===id);if(ordinal<0)throw new Error('Duplicate-menu hit missing');
      const facts=spec.id==='kaedeharakazuha'?[{subject:{kind:'actor',id:actor},values:{'kaedeharakazuha.crimsonMomijiInfusion':bool(false)}}]:[];
      return addSkillHit(project,actor,spec.skill,ordinal,1000+i,{crit:'noncritical',reaction:'none',facts});
    });
    const result=engine.evaluateTimeline(project),actual=events.map(id=>result.points.find(point=>point.id===id)?.value);
    const probe=(await probeMonaSkills({characters:[spec.name],indices:[spec.index],constellations:[0],configure(input){
      Object.assign(input.character,{level:1,ascend:false,constellation:0,skill1:0,skill2:0,skill3:0});Object.assign(input.weapon,{level:1,ascend:false,refine:1});input.artifacts=[];input.buffs=[];input.enemy=null;
    }})).rows[0];
    if(probe?.status!=='ok')throw new Error('Duplicate-menu Mona probe unavailable');
    const attack=character.attributes.base.attack*character.progression.curves.attack[1]+character.progression.promotion[0].attack+weapon.baseAttack;
    const correction=attack-sum(probe.analysis.atk);if(Math.abs(correction)>1)throw new Error('Duplicate-menu natural panel cannot align');
    const alignedInput=structuredClone(probe.input);alignedInput.buffs=[{name:'ATKFixed',config:{ATKFixed:{value:correction}}}];
    const aligned=api.CalculatorInterface.get_damage_analysis(alignedInput,null),ratio=sum(aligned.atk_ratio),ratios=spec.params.map(parameter=>stats[spec.id][spec.group][parameter][0]);
    const factor=101/291*.9, expected=ratios.map(value=>attack*value*factor);
    if(!actual.every((value,i)=>wrongArmNear(value,expected[i],1e-8)) || !wrongArmNear(sum(aligned.atk),attack,1e-8)
      || !wrongArmNear(aligned.normal.non_critical,attack*ratio*factor,1e-8) || Math.abs(ratio-ratios[0])>.00005 || Math.abs(ratio-ratios[1])<.1) throw new Error('Duplicate-menu runtime or source ratio differs');
    const row={spec,project,events,ratios,expected,actual,mona:{input:probe.input,nativeAttack:sum(probe.analysis.atk),nativeDamage:probe.analysis.normal.non_critical,
      alignedInput,attack:sum(aligned.atk),damage:aligned.normal.non_critical,ratio,correction}};
    const deps=[spec.source,'tools/lib/mona-ordinary-audit.mjs','tools/lib/mona-inventory-probes.mjs','tools/lib/roster-audit-settings.mjs',
      'src/web/src/domain/real-project.ts','src/web/src/domain/workbench-project.ts',official+'/stats/talents.json'];
    const proof={row,provenance:amplificationFingerprint(spec.id,spec.weapon),dependencies:Object.fromEntries(deps.map(path=>[path,createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')]))};
    rows.push(row);mappings.push({id:`ordinary-duplicate-menu:${spec.name}:${spec.index}`,disposition:'different',coverage:'scenario',mona:[skill.id,branch.id],
      leyline:[{id:target.id,revision:'3'}],scopedDuplicateMenuProof:proof,
      explanation:'固定 Mona 两个邻近菜单标签绑定同一个第一段；该一级单次场景以原生面板和对齐面板分别核验，正式第二段使用独立原始倍率。',
      sources:[spec.source, runtime, target.source, official+'/stats/talents.json#/'+spec.id+'/'+spec.group+'/'+spec.params[1],'tools/lib/mona-ordinary-audit.mjs'],
      comparisons:[{name:'LeyLine first adjacent hit',expected:expected[0],actual:actual[0],tolerance:1e-8},
        {name:'LeyLine requested second hit',expected:expected[1],actual:actual[1],tolerance:1e-8},
        {name:'Mona aligned menu uses first hit',expected:expected[0],actual:aligned.normal.non_critical,tolerance:1e-8}]});
  }
  return {rows,mappings,scope:'Only these two C0 level-one single-hit menus, empty artifacts and level-90 enemy; Mona attack rounded with an explicit synthetic correction.'};
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
      || binding.unlock || !Array.isArray(terms) || terms.length !== 1 || !wrongArmAxes[terms[0].stat]
      || !terms[0].parameter || Object.keys(terms[0]).some(key => !['stat', 'parameter'].includes(key))) continue;
    const sourceOptions = source.get(skill.character) ?? [];
    const arm = sourceOptions.length === 1 ? readArm(sourceOptions[0], skill) : null;
    if (!arm || arm.group !== group) continue;
    summary.sourceArm++;
    const parameter = terms[0].parameter, table = stats[hit.entity]?.['combat' + group]?.[parameter];
    const character = characters.get(hit.entity), talent = character?.talents.find(row => row.id === binding.skillId);
    const actualHit = talent?.hits.find(row => row.id === binding.hitId), authored = talent?.parameters.find(row => row.id === parameter)?.values;
    const text = official + '/stats/talents.json#/' + hit.entity;
    const weapon = weapons.get(novice[character?.identity?.weaponType]);
    if (!Array.isArray(table) || !authored || !weapon || !actualHit
      || table.length < 15 || authored.length < 15 || arm.table.length < 15
      || !table.slice(0, 15).every((value, index) => wrongArmNear(value, authored[index]))) continue;
    summary.officialTable++;
    record.arm = arm; record.cases = []; record.ratios = [];
    try {
      for (let level = 1; level <= 15; level++) {
        const input = structuredClone(branch.scenario.input);
        input.character.skill1 = input.character.skill2 = input.character.skill3 = level - 1;
        const result = api.CalculatorInterface.get_damage_analysis(input, null);
        const axis = wrongArmAxes[terms[0].stat], ratio = sum(result[axis]);
        const other = Object.values(wrongArmAxes).filter(name => name !== axis).every(name => wrongArmNear(sum(result[name]), 0));
        if (!other || !wrongArmNear(sum(result.extra_damage), 0) || result.is_heal || result.is_shield
          || String(result.element).toLowerCase() !== binding.element || !wrongArmNear(ratio, arm.table[level - 1], .000001)) throw new Error('Runtime does not isolate source arm');
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
        if (!wrongArmNear(actual, expected, Math.max(1e-6, Math.abs(expected) * 1e-6))) throw new Error('LeyLine engine result is unknown or differs from neutral equation');
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

// --- mona-amplification-batch.mjs ---

const ampNear = (a,b,tolerance=1e-4) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b) <= tolerance * Math.max(1,Math.abs(a),Math.abs(b));
const directions = { pyro:{melt:{factor:2,aura:'cryo'},vaporize:{factor:1.5,aura:'hydro'}}, hydro:{vaporize:{factor:2,aura:'pyro'}}, cryo:{melt:{factor:1.5,aura:'pyro'}} };
const ampAxes = {attack:['atk','atk_ratio'],hp:['hp','hp_ratio'],defense:['def','def_ratio'],elementalMastery:['em','em_ratio']};

/** Verify only default C0 branch IDs already attached to a reviewed ordinary hit. */
export async function auditMonaAmplificationBatch(monaRows, leylineRows, ordinary, entities, engine) {
  const {api}=await import('../../.references/mona-community/beta-tools/runtime-7106.mjs');
  const targets=new Map(leylineRows.map(row=>[row.id,row]));
  const characters=new Map(entities.characters.map(row=>[row.id,row]));
  const weapons=new Map(entities.weapons.map(row=>[row.id,row]));
  const branches=new Map(monaRows.filter(row=>row.kind==='output-branch' && row.output==='damage' && row.scenario?.id==='default' && row.scenario?.constellation===0 && ['melt','vaporize'].includes(row.branch)).map(row=>[row.parentId+'\0'+row.branch,row]));
  const results=[],mappings=[];
  for(const ordinaryReview of ordinary.mappings ?? []) {
    if(ordinaryReview.disposition!=='matched' || ordinaryReview.leyline?.length!==1) continue;
    const skillId=ordinaryReview.mona.find(id=>id.startsWith('mona:skill:'));
    const hit=targets.get(ordinaryReview.leyline[0].id), character=characters.get(hit?.entity), binding=hit?.binding;
    const weapon=weapons.get(novice[character?.identity?.weaponType]);
    const talent=character?.talents.find(item=>item.id===binding?.skillId), actualHit=talent?.hits.find(item=>item.id===binding?.hitId);
    if(!skillId||!hit||!character||!weapon||!talent||!actualHit) continue;
    for(const [reaction,config] of Object.entries(directions[binding.element] ?? {})) {
      const branch=branches.get(skillId+'\0'+reaction);
      if(!branch) continue;
      const record={id:branch.id,leyline:hit.id,reaction,element:binding.element,aura:config.aura,status:'unresolved',cases:[]};
      results.push(record);
      try {
        for(const level of [1,6,10]) {
          const input=structuredClone(branch.scenario.input);
          input.character.constellation=0;input.character.level=90;input.character.ascend=false;
          for(const slot of [1,2,3]) input.character['skill'+slot]=level-1;
          input.weapon.level=1;input.weapon.ascend=false;input.weapon.refine=1;input.artifacts=[];input.buffs=[];input.enemy=null;
          const analysis=api.CalculatorInterface.get_damage_analysis(input,null);
          if(String(analysis.element).toLowerCase()!==binding.element || !analysis[reaction] || analysis.is_heal || analysis.is_shield) throw new Error('Mona reaction branch unavailable');
          const em=sum(analysis.em), enhancement=analysis[reaction+'_enhance'] ?? {};
          const otherBonus=Object.entries(enhancement).filter(([key])=>key!=='精通').reduce((a,[,v])=>a+v,0);
          const masteryBonus=(25/9)*em/(1400+em);
          if(!ampNear(sum(enhancement),masteryBonus+otherBonus,1e-6)) throw new Error('Mona mastery enhancement differs from independent formula');
          const monaBase=Object.values(ampAxes).reduce((total,[stat,ratio])=>total+sum(analysis[stat])*sum(analysis[ratio]),0)+sum(analysis.extra_damage);
          const monaNormal=monaBase*(1+sum(analysis.bonus))*.5*.9;
          const monaExpected=monaNormal*config.factor*(1+masteryBonus+otherBonus), monaActual=analysis[reaction].non_critical;
          const build={...auditBuild(character,weapon),level:90,ascension:6,talents:{normal:level,skill:level,burst:level}};
          const team=engine.prepareStructuredBuilds([{id:'actor',build}]);if(!team.ok) throw new Error('LeyLine build failed');
          const {setup,request}=auditHit(character,talent,actualHit,90);
          setAuditDefaults(character,request.frame); setAuditDefaults(weapon,request.frame);
          request.frame.factOverrides.push({subject:{kind:'target',id:'enemy'},facts:{['aura.'+config.aura]:bool(true)}});
          const normal=engine.evaluateStructuredHit(team.team,setup,request).totals.all.value?.value;
          request.reactionMode=reaction;
          const evaluated=engine.evaluateStructuredHit(team.team,setup,request);
          const actual=evaluated.totals.all.value?.value;
          const specialized=character.attributes.specialized, promotion=character.progression.promotion[6].specialized;
          const leyEm=specialized==='elementalMastery'?promotion:0;
          const panel=Object.fromEntries(['hp','attack','defense'].map(stat=>[stat,character.attributes.base[stat]*character.progression.curves[stat][90]+character.progression.promotion[6][stat]]));
          panel.attack+=weapon.baseAttack; panel.elementalMastery=leyEm;
          for(const stat of ['hp','attack','defense']) if(specialized===stat+'Percent') panel[stat]*=1+promotion;
          const elementalBonus=specialized===binding.element+'Bonus'?promotion:0;
          const independentNormal=binding.definition.base.reduce((total,term)=>total+panel[term.stat]*talent.parameters.find(item=>item.id===term.parameter).values[level-1],0)*(1+elementalBonus)*.5*.9;
          const expected=independentNormal*config.factor*(1+2.78*leyEm/(1400+leyEm));
          record.cases.push({level,mona:{normal:monaNormal,em,otherBonus,expected:monaExpected,actual:monaActual,panel:Object.fromEntries(Object.entries(ampAxes).map(([key,[stat,ratio]])=>[key,{stat:sum(analysis[stat]),ratio:sum(analysis[ratio])}])),bonus:sum(analysis.bonus)},leyline:{normal,em:leyEm,expected,actual,panel,elementalBonus}});
          if(!ampNear(monaNormal,analysis.normal?.non_critical,1e-8) || !ampNear(monaExpected,monaActual,1e-8)) throw new Error('Mona reaction formula mismatch');
          if(!ampNear(independentNormal,normal,1e-8)||!ampNear(expected,actual,1e-8)) throw new Error('LeyLine reaction formula mismatch or unavailable');
          const rounded={elementalMastery:Math.round(leyEm)};
          for(const stat of ['hp','attack','defense']) {
            const white=character.attributes.base[stat]*character.progression.curves[stat][90]+character.progression.promotion[6][stat];
            rounded[stat]=(Math.round(white)+(stat==='attack'?Math.round(weapon.baseAttack):0))*(specialized===stat+'Percent'?1+promotion:1);
          }
          const reconstructed=Object.entries(ampAxes).every(([stat,[panelKey,ratioKey]])=>{
            const terms=binding.definition.base.filter(term=>term.stat===stat);
            const ratio=terms.reduce((total,term)=>total+talent.parameters.find(item=>item.id===term.parameter).values[level-1],0);
            return (!terms.length || ampNear(sum(analysis[panelKey]),rounded[stat],1e-9)) && Math.abs(sum(analysis[ratioKey])-ratio)<=.000051*Math.max(1,terms.length);
          });
          if(otherBonus!==0 || !ampNear(em,rounded.elementalMastery,1e-9) || !ampNear(sum(analysis.bonus),elementalBonus,1e-9) || !reconstructed || sum(analysis.extra_damage)!==0) throw new Error('Panel differences cannot be reconstructed from integer stats and four-decimal ratios');
        }
        record.status=record.cases.some(item=>item.mona.em!==0)?'different':'matched';
        mappings.push({id:'amplification-batch:'+branch.character+':'+branch.index+':'+reaction,disposition:record.status,mona:[branch.id],leyline:[{id:hit.id,revision:hit.revision}],
          explanation:'C0 默认分支，分别按同一反应方向、目标元素附着、90 级角色、1 级武器及空圣遗物核验；三个天赋等级各自使用面板数值和独立反应公式，逐项重建 Mona 整数面板及四位小数倍率，精通非零时 Mona 采用 25/9、LeyLine 采用 2.78 的精通系数，故分别按各自公式比较。',
          sources:[branch.source.path,hit.source,'tools/lib/mona-amplification-batch.mjs','src/engine/src/calculation/templates-reactions.ts','.references/mona-community/mona_core/src/damage/reaction.rs','tools/data/sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/reaction-facts.json'],
          comparisons:record.cases.flatMap(item=>[{name:'Mona level '+item.level,expected:item.mona.expected,actual:item.mona.actual,tolerance:Math.max(1e-8,Math.abs(item.mona.expected)*1e-8)},{name:'LeyLine level '+item.level,expected:item.leyline.expected,actual:item.leyline.actual,tolerance:Math.max(1e-8,Math.abs(item.leyline.expected)*1e-8)}])});
      } catch(error) {record.reason=String(error?.message??error);}
    }
  }
  return {rows:results,mappings,summary:{eligible:results.length,reviewed:mappings.length,unresolved:results.length-mappings.length},limitations:['Only C0 default branch IDs of previously reviewed ordinary hits are mapped.','The supplied aura fact and single reaction mode do not prove aura application or event triggering.']};
}
