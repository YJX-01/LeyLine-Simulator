import { probeMonaSkills } from './mona-calculation-probes.mjs';
import { auditBuild, auditHit, novice, setGateFacts } from './roster-audit-settings.mjs';
import { readContentSource } from './content-source.mjs';
const sum = value => Object.values(value ?? {}).reduce((a, b) => a + b, 0);
export const ordinaryHitName = value => String(value ?? '').normalize('NFKC').toLowerCase()
  .replace(/\(第(\d+)击\)/g, '$1').replace(/[^\p{L}\p{N}]/gu, '');
const axes = { attack: ['atk', 'atk_ratio'], hp: ['hp', 'hp_ratio'], defense: ['def', 'def_ratio'], elementalMastery: ['em', 'em_ratio'] };
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 0.0001 * Math.max(1, Math.abs(a));
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
  'klee.hexereiAwakened', 'klee.chainedSparkAttackActive', 'mona.hexereiAwakened', 'mona.recipientHexerei',
]);
export function ordinaryInactiveWindows(character) {
  const result = Object.fromEntries(Object.entries(character.metadata.facts ?? {})
    .filter(([key, fact]) => inactiveWindows.has(key) && fact.type.kind === 'boolean').map(([key]) => [key, false]));
  return result;
}
const baselinePanelLabel = /^(角色基础|武器基础|圣遗物词条|角斗士的终幕礼[24]|角色副属性|初始值)/;
const tolerance = expected => Math.max(.000001, Math.abs(expected) * .0001);
const close = (expected, actual) => Number.isFinite(expected) && Number.isFinite(actual)
  && Math.abs(expected - actual) <= tolerance(expected);
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
const hasAdditionalEffect = analysis => ['atk', 'hp', 'def', 'em', 'bonus'].some(key =>
  Object.entries(analysis[key] ?? {}).some(([label, value]) => value !== 0 && !baselinePanelLabel.test(label)));

function ordinaryCommonPanel(analysis, terms, parameters, level) {
  return terms.reduce((total, term) => total + sum(analysis[axes[term.stat][0]])
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
  panel.elementalMastery = 0;
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
    if (!weapon || !actualHit || definition.when || definition.selection || definition.elementBy || definition.infusion || definition.snapshot || binding.unlock || !Array.isArray(definition.base) || definition.base.some(term => !axes[term.stat] || !term.parameter || Object.keys(term).some(key => !['stat', 'parameter'].includes(key)))) continue;
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
        const monaBase = Object.values(axes).reduce((total, [stat, ratio]) => total + sum(analysis[stat]) * sum(analysis[ratio]), 0) + sum(analysis.extra_damage);
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
          panel: Object.fromEntries(Object.entries(axes).map(([key, [stat, ratio]]) => [key, { stat: sum(analysis[stat]), ratio: sum(analysis[ratio]) }])),
          bonus: sum(analysis.bonus), extraDamage: sum(analysis.extra_damage) }, commonPanel: { expected: monaActual, actual: commonActual },
          leyline: { expected, actual, panel: values, elementalBonus,
          ...(evaluated.requiredInputs?.length ? { requiredInputs: evaluated.requiredInputs } : {}) } });
        if (!near(monaExpected, monaActual)) throw new Error('Mona damage differs from baseline equation');
        if (!near(monaActual, commonActual)) throw new Error('Damage differs on common panel');
        if (!Number.isFinite(actual)) throw new Error('LeyLine damage is unknown');
        if (!near(expected, actual)) throw new Error('LeyLine damage differs from baseline equation');

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
      || terms.some(term => !axes[term.stat] || !term.parameter || Object.keys(term).some(key => !['stat', 'parameter'].includes(key)))) {
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
        const ratios = Object.fromEntries(Object.keys(axes).map(key => [key, 0]));
        for (const term of terms) ratios[term.stat] += talent.parameters.find(p => p.id === term.parameter)?.values[effectiveLevel - 1] ?? NaN;
        if (Object.entries(axes).some(([stat, [, ratio]]) => !close(ratios[stat], sum(analysis[ratio]))) || !close(0, sum(analysis.extra_damage))) {
          throw new Error('C6 scaling differs after talent-rank alignment');
        }
        const monaExpected = Object.values(axes).reduce((total, [stat, ratio]) => total + sum(analysis[stat]) * sum(analysis[ratio]), 0)
          * (1 + sum(analysis.bonus)) * .45;
        const commonActual = Object.entries(axes).reduce((total, [stat, [key]]) => total + sum(analysis[key]) * ratios[stat], 0)
          * (1 + sum(analysis.bonus)) * .45;
        const monaActual = analysis.normal.non_critical;
        if (level === 10 && (!Number.isFinite(branch.result.non_critical) || Math.abs(branch.result.non_critical - monaActual) > 1e-9
          || ['skill1', 'skill2', 'skill3'].some(key => input.character[key] !== branch.scenario.input.character[key]))) {
          throw new Error('C6 stored default branch differs from the unaltered level-10 input');
        }
        if (!close(monaExpected, monaActual) || !close(monaActual, commonActual)) throw new Error('C6 Mona or common-panel damage differs');
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
          mona: { expected: monaExpected, actual: monaActual, panel: Object.fromEntries(Object.entries(axes).map(([key, [stat]]) => [key, sum(analysis[stat])])), bonus: sum(analysis.bonus) },
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
