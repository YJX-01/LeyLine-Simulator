import { auditBuild, auditHit, novice, number, setGateFacts } from './roster-audit-settings.mjs';
import { ordinaryInactiveWindows, soloTalentGrants } from './mona-ordinary-batch.mjs';
import { readContentSource } from './content-source.mjs';
import { probeMonaSkills } from './mona-calculation-probes.mjs';

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
        sources: [...new Set([...review.sources, ...(c6Review?.sources ?? []), target.source, rollSource, upstreamRollSource, 'tools/lib/mona-common-input-batch.mjs',
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
            'tools/lib/mona-common-input-batch.mjs'] });
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
