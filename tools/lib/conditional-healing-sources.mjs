import { readContentSource } from './content-source.mjs';
import { loadContentSchema } from './load-content-schema.mjs';
import { auditBuild, auditHit, bool, fact, number } from './roster-audit-settings.mjs';

const catalog = 'tools/data/sources/catalog/genshin-db/';
const pinned = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const evidencePath = 'tools/data/sources/catalog/conditional-healing-sources.json';
const gameConfigPath = 'tools/data/sources/anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/character-healing-facts.json';
const kqmPath = 'tools/data/sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/equipment-healing-facts.json';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const { shinobu, isshin } = read(evidencePath);
const { vodyanitsa: config, source: gameConfig } = read(gameConfigPath);
const { formula, testedSelfHealingWeapons, source: kqm } = read(kqmPath);
const kqmSource = path => 'https://github.com/' + kqm.repository + '/blob/' + kqm.commit + '/' + path;
const characters = read(catalog + 'characters.json');
const weapons = read(catalog + 'weapons.json');
const sets = read(catalog + 'sets.json');
const characterCurves = read(catalog + 'character-curves.json');
const weaponCurves = read(catalog + 'weapon-curves.json');
const talentsPath = pinned + 'stats/talents.json';
const talents = read(talentsPath);
const kukiPath = pinned + 'ChineseSimplified/talents/kukishinobu.json';
const kukiConstellationsPath = pinned + 'ChineseSimplified/constellations/kukishinobu.json';
const vodyanitsaPath = pinned + 'ChineseSimplified/constellations/vodyanitsa.json';
const shinobuTalents = read(kukiPath);
const vodyanitsaConstellations = read(vodyanitsaPath);
const c4Description = vodyanitsaConstellations.c4.description;
const percent = (description, pattern) => {
  const value = pattern.exec(description)?.[1];
  if (value === undefined) throw new Error('找不到治疗数值的原文：' + description);
  return Number(value) / 100;
};
const masteryRate = percent(shinobuTalents.passive2.description, /治疗量提升值：元素精通的(\d+)%/);
const kukiThreshold = percent(shinobuTalents.passive1.description, /生命值不高于(\d+)%/);
const kukiBonus = percent(shinobuTalents.passive1.description, /治疗加成提升(\d+)%/);
const kukiTalentLevels = Number(read(kukiConstellationsPath).c3.description.match(/技能等级提高(\d+)级/)[1]);
const vodyanitsaTalentLevels = Number(vodyanitsaConstellations.c3.description.match(/技能等级提高(\d+)级/)[1]);
const c4Threshold = percent(c4Description, /低于(\d+)%：本次治疗/);
const c4HealIncrease = percent(c4Description, /本次治疗量提升(\d+)%/);
const c4HpPercent = percent(c4Description, /生命值上限提升(\d+)%/);
const [c4HpThreshold, c4ExtraHeal, c4MaxHp] = config.parameters.record.paramList;
const maiden = percent(sets.maidenbeloved.effect2Pc, /治疗效果提升(\d+)%/);
const doctor = percent(sets.travelingdoctor.effect2Pc, /受到的治疗效果提高(\d+)%/);
const formulaSources = [kqmSource(formula.path), kqmSource(formula.evidence)];
const match = (value, other) => value === other || Number.isFinite(value) && Number.isFinite(other) && Math.abs(value - other) < 1e-7;
const actorFacts = (id, values) => ({ subject: { kind: 'actor', id }, values });
const ratio = value => value === null ? fact(null) : number('scalar', value);
const ref = id => ({ namespace: 'builtin', id, revision: '1' });

export const conditionalHealingCharacterIds = ['kukishinobu', 'vodyanitsa', 'kaeya', 'jean'];
const swords = ['prizedisshinblade', 'prizedisshinblade-01', 'prizedisshinblade-02'];
export const conditionalHealingWeaponIds = ['ironsting', 'dullblade', 'apprenticesnotes', 'travelershandysword', ...swords];
export const conditionalHealingSetIds = ['maidenbeloved', 'travelingdoctor'];

function whiteCharacter(build, key) {
  const { base, curve, promotion } = characters[build.character.id].stats;
  return base[key] * characterCurves[build.level][curve[key]] + promotion[build.ascension][key];
}

function weaponSpecialized(build, type) {
  const stats = weapons[build.weapon.id].stats;
  return stats.specialized === type ? stats.base.specialized * weaponCurves[build.weaponLevel][stats.curve.specialized] : 0;
}

function sourceAttack(build) {
  const { base, curve, promotion } = weapons[build.weapon.id].stats;
  const weaponAttack = base.attack * weaponCurves[build.weaponLevel][curve.attack] + promotion[build.weaponAscension].attack;
  return (whiteCharacter(build, 'attack') + weaponAttack) * (1 + weaponSpecialized(build, 'FIGHT_PROP_ATTACK_PERCENT'));
}

function sourceHp(build, bonus = 0) {
  return whiteCharacter(build, 'hp') * (1 + characters[build.character.id].stats.promotion[build.ascension].specialized + bonus);
}

/** Uses the calculator's saved project entries and the public current attribute evaluation. */
export async function auditConditionalHealingSources(entities, engine) {
  const rows = [], resolved = [], gaps = [];
  const [character, weapon, set] = ['characters', 'weapons', 'sets'].map(group => new Map(entities[group].map(entry => [entry.id, entry])));
  const { createEmptyProject } = await loadContentSchema('/src/web/src/domain/workbench-project.ts');
  const { addActorFromBuild, addTalentHeal, defaultEnemy } = await loadContentSchema('/src/web/src/domain/real-project.ts');
  const build = (entity, equipment, setIds = [], overrides = {}) => {
    if (!character.has(entity) || !weapon.has(equipment) || setIds.some(id => !set.has(id))) return;
    const chosen = setIds.map(id => set.get(id));
    return { ...auditBuild(character.get(entity), weapon.get(equipment), chosen), ...overrides,
      theoreticalSetSlots: chosen.flatMap((gear, i) => gear.slots.slice(i * 2, i * 2 + 2).map(slot => ({ slot, setId: gear.id }))) };
  };
  function record({ expected, expectedStatus, expectedBase = null, expectedMissing, ...input }, value, actualStatus, actualBase = null, missing = []) {
    const correct = match(value, expected) && expectedStatus === actualStatus && match(expectedBase, actualBase)
      && (!expectedMissing || missing.some(key => key.includes(expectedMissing)));
    rows.push({ ...input, expected, value, expectedStatus, actualStatus, expectedBase, actualBase, missing,
      ...correct ? {} : { issue: '治疗量、适用条件或未确认项与固定来源不符' } });
  }
  function talentGroup(ownerBuild, allyBuild, healId, report, cases) {
    if (!ownerBuild || !allyBuild) return;
    const project = createEmptyProject();
    project.enemy = defaultEnemy();
    const owner = addActorFromBuild(project, ownerBuild), ally = addActorFromBuild(project, allyBuild);
    const checks = cases.map(({ same, onField, ownerHp, recipientHp, stacks, ...scenario }, i) => {
      const recipient = same ? owner : ally;
      const facts = [actorFacts(owner, { hpRatio: ratio(ownerHp), onField: bool(same ? onField : !onField),
        ...(stacks !== undefined && { 'vodyanitsa.c4HealthStacks': number('count', stacks) }) })];
      if (!same) facts.push(actorFacts(ally, { hpRatio: ratio(recipientHp), onField: bool(onField) }));
      return { scenario: { ...scenario, recipient: same ? 'owner' : 'ally', onField, ownerHp, recipientHp: same ? ownerHp : recipientHp, stacks },
        source: addTalentHeal(project, owner, recipient, healId, i + 1, facts) };
    });
    const timeline = engine.evaluateTimeline(project);
    const changes = new Map((timeline.combatChanges ?? []).filter(change => change.kind === 'talent-healing').map(change => [change.source, change]));
    for (const { source, scenario } of checks) {
      const actual = changes.get(source);
      record({ ...report, ...scenario }, actual?.healing ?? null, actual?.status ?? 'missing', actual?.baseHealing ?? null, actual?.missing);
    }
  }

  const kuki = { entity: 'kukishinobu', field: '/talents/1/heals/0/extra',
    sources: [kukiPath + '#/passive2/description', kukiPath + '#/passive1/description', kukiConstellationsPath + '#/c3/description',
      talentsPath + '#/kukishinobu/combat2',
      catalog + 'characters.json#/kukishinobu/stats', catalog + 'weapons.json#/ironsting/stats', catalog + 'character-curves.json',
      catalog + 'weapon-curves.json', catalog + 'sets.json#/maidenbeloved/effect2Pc', catalog + 'sets.json#/travelingdoctor/effect2Pc',
      evidencePath + '#/shinobu', shinobu.record, ...shinobu.checks.map(check => check.video), ...formulaSources] };
  for (const test of shinobu.checks) if (Math.abs(shinobu.elementalMastery * masteryRate * (1 + test.outgoingHealingBonus) - test.observedIncrease) > .5) {
    throw new Error('安心之所的元素精通加算与独立疗量记录不符');
  }
  for (const [level, ascension, skill, constellation, weaponId, gear] of [
    [1, 0, 1, 0, 'ironsting', false], [60, 3, 4, 0, 'ironsting', false],
    [60, 4, 6, 0, 'dullblade', false], [60, 4, 6, 3, 'ironsting', true],
  ]) {
    const owner = build(kuki.entity, weaponId, gear ? ['maidenbeloved'] : [], { level, ascension, constellation, talents: { normal: 1, skill, burst: 1 } });
    const ally = build('kaeya', 'dullblade', gear ? ['travelingdoctor'] : []);
    if (!owner || !ally) continue;
    const rank = skill + (constellation >= 3 ? kukiTalentLevels : 0);
    const { param2, param3 } = talents.kukishinobu.combat2;
    const elementalMastery = weaponSpecialized(owner, 'FIGHT_PROP_ELEMENT_MASTERY');
    const base = sourceHp(owner) * param2[rank - 1] + param3[rank - 1] + (ascension >= 4 ? masteryRate * elementalMastery : 0);
    const cases = [[false, true, .499, .95], [false, true, .5, .9], [false, true, .501, .1],
      [true, true, .5, .5], [false, false, .5, .5]];
    if (ascension >= 1) cases.push([false, true, null, .2]);
    talentGroup(owner, ally, 'kukishinobu.skill.heal.param2', { ...kuki, level, ascension, rank, constellation, elementalMastery }, cases.map(([same, onField, ownerHp, recipientHp]) => {
      const outgoing = (gear ? maiden : 0) + (ascension >= 1 && ownerHp !== null && ownerHp <= kukiThreshold ? kukiBonus : 0);
      const incoming = gear && !same ? doctor : 0;
      const pending = ownerHp === null;
      return { same, onField, ownerHp, recipientHp, expectedStatus: !onField ? 'excluded' : pending ? 'unknown' : 'applied',
        expected: !onField ? 0 : pending ? null : base * (1 + outgoing + incoming),
        expectedBase: pending ? base : null, expectedMissing: pending ? 'healingBonus' : undefined };
    }));
  }

  const vody = { entity: 'vodyanitsa', field: '/talents/1/heals/0/multiplier',
    sources: [vodyanitsaPath + '#/c3/description', vodyanitsaPath + '#/c4/description', pinned + 'ChineseSimplified/talents/vodyanitsa.json#/combat2',
      talentsPath + '#/vodyanitsa/combat2', catalog + 'characters.json#/vodyanitsa/stats', catalog + 'character-curves.json',
      catalog + 'sets.json#/maidenbeloved/effect2Pc', catalog + 'sets.json#/travelingdoctor/effect2Pc',
      gameConfigPath + '#/vodyanitsa', ...[config.talent, config.parameters, config.healing].map(entry =>
        gameConfig.repository + '/blob/' + gameConfig.revision + '/' + entry.path), ...formulaSources] };
  const c4 = config.healing.action, hpBranch = c4.successActions[0];
  const [plain] = c4.failActions, [lowHp] = hpBranch.failActions, [highHp, stack] = hpBranch.successActions;
  const [rankGate] = c4.targetPredicates, [hpGate] = hpBranch.targetPredicates;
  const [unlock, hpBinding, healBinding, stackBinding] = config.talent.actions;
  const healInput = (key) => JSON.stringify(lowHp[key]) === JSON.stringify([plain[key], plain[key], healBinding.paramSpecial, 'MUL', 'ADD']);
  if (config.talent.pointer !== '/' + config.parameters.record.openConfig || c4.$type !== 'Predicated' || hpBranch.$type !== 'Predicated'
    || [unlock, hpBinding, healBinding, stackBinding].some(action => action.abilityName !== config.healing.abilityName)
    || unlock.$type !== 'UnlockTalentParam' || rankGate.$type !== 'ByUnlockTalentParam' || unlock.talentParam !== rankGate.talentParam
    || hpGate.$type !== 'ByTargetHPRatio' || hpGate.logic !== 'GreaterOrEqual' || hpGate.hpRatio !== hpBinding.paramSpecial
    || [hpBinding, healBinding, stackBinding].some((action, index) => action.$type !== 'ModifyAbility' || action.paramDelta !== '%' + (index + 1))
    || c4HpThreshold !== c4Threshold || c4ExtraHeal !== c4HealIncrease || c4MaxHp !== c4HpPercent
    || plain.$type !== 'HealHP' || JSON.stringify(plain) !== JSON.stringify(highHp) || lowHp.$type !== 'HealHP'
    || hpBranch.target !== plain.target || lowHp.target !== plain.target || lowHp.doOffStage !== plain.doOffStage
    || lowHp.AMAHJLOKEIE !== plain.AMAHJLOKEIE || !healInput('amount') || !healInput('amountByCasterMaxHPRatio')
    || stack.$type !== 'ApplyModifier' || stack.modifierName !== 'Vodyanitsa_Constellation_4_Buff') {
    throw new Error('沃雅妮莎四命的原始阈值、治疗动作或治疗量参数与固定来源不符');
  }
  for (const [constellation, outgoingSet, incomingSet] of [
    [3, false, false], [4, false, false], [4, true, false], [4, false, true], [4, true, true],
  ]) {
    const skill = 6, rank = skill + vodyanitsaTalentLevels, level = 60, ascension = 4;
    const owner = build(vody.entity, 'apprenticesnotes', outgoingSet ? ['maidenbeloved'] : [], { level, ascension, constellation, talents: { normal: 1, skill, burst: 1 } });
    const ally = build('kaeya', 'dullblade', incomingSet ? ['travelingdoctor'] : []);
    if (!owner || !ally) continue;
    const { param5, param6 } = talents.vodyanitsa.combat2;
    const cases = [[false, true, .9, .399, 0], [false, true, .1, .4, 0], [false, true, .1, .401, 0],
      [true, true, .399, .399, 0], [false, true, .1, null, 0], [false, false, .2, .3, 0],
      [false, true, .85, .65, 2], [false, true, .85, .39, 3]];
    talentGroup(owner, ally, 'vodyanitsa.skill.heal.param6', { ...vody, level, ascension, rank, constellation },
      cases.map(([same, onField, ownerHp, recipientHp, stacks]) => {
        const hp = sourceHp(owner, constellation >= 4 ? stacks * c4MaxHp : 0);
        const boosted = constellation >= 4 && recipientHp !== null && recipientHp < c4HpThreshold;
        const unknown = constellation >= 4 && recipientHp === null;
        const input = value => boosted ? value + value * c4ExtraHeal : value;
        const base = hp * input(param6[rank - 1]) + input(param5[rank - 1]);
        const outgoing = outgoingSet ? maiden : 0, incoming = incomingSet && !same ? doctor : 0;
        return { same, onField, ownerHp, recipientHp, stacks, outgoing, incoming, expectedStatus: !onField ? 'excluded' : unknown ? 'unknown' : 'applied',
          expected: !onField ? 0 : unknown ? null : base * (1 + outgoing + incoming),
          expectedBase: onField && unknown ? base : null,
          expectedMissing: onField && unknown ? 'hpRatio' : undefined };
      }));
  }

  const healing = { kind: 'attribute', actor: { role: 'recipient' }, key: ref('attribute.equipmentHealing'), at: { kind: 'current', phase: 'same' } };
  const swordReports = [];
  for (const entity of swords) {
    if (!weapon.has(entity)) continue;
    const source = weapons[entity], description = source.metadata.r1.description;
    const fraction = /恢复/.test(description) ? percent(description, /恢复等同于攻击力(\d+)%/) : 0;
    const config = isshin.records.find(entry => entry.affixId === source.metadata.id + 100000);
    const cursedHeal = isshin.actions.Weapon_Sword_YoutouEnchanted, knownHeal = isshin.actions.Weapon_Sword_OnGainEnergyHealHP;
    if (!config || fraction !== (config.openConfig.endsWith('Shattered') ? 0 : config.paramList[1])
      || cursedHeal.$type !== knownHeal.$type || cursedHeal.amountByCasterAttackRatio !== 'Heal_Ratio' || cursedHeal.AMAHJLOKEIE !== knownHeal.AMAHJLOKEIE
      || !testedSelfHealingWeapons.weapons.includes('travelershandysword')) throw new Error('祟灵武器配置与独立原文或治疗记录不符');
    const sword = { entity, field: fraction ? '/buffs/1/modifiers/0' : '/hits/' + entity + '.curse',
      ...(fraction && { output: 'attribute.equipmentHealing' }),
      sources: [catalog + 'weapons.json#/' + entity + '/metadata/r1/description', catalog + 'weapons.json#/' + entity + '/stats',
        catalog + 'characters.json#/kaeya/stats', catalog + 'character-curves.json', catalog + 'weapon-curves.json',
        evidencePath + '#/isshin', isshin.affixes, isshin.abilities, kqmSource(testedSelfHealingWeapons.path), ...formulaSources] };
    swordReports.push({ ...sword, fraction });
    for (const [level, ascension, gear] of [[1, 0, false], [40, 2, true]]) {
      const owner = build('kaeya', entity, gear ? ['maidenbeloved', 'travelingdoctor'] : [], { level, ascension, weaponLevel: level, weaponAscension: ascension });
      // A second, unrelated healing weapon makes the shared output available even for the shattered sword.
      const ally = build('jean', 'travelershandysword');
      if (!owner || !ally) continue;
      const compiled = engine.prepareStructuredBuilds([{ id: 'actor', build: owner }, { id: 'ally', build: ally }]);
      if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
      const talent = owner.character.talents[0], hit = talent.hits[0];
      const { setup, request } = auditHit(owner.character, talent, hit);
      const context = engine.createStructuredCombatContext(compiled.team, setup);
      const effect = engine.calculationEffectInstanceId('actor', ref(entity + '.curse-healing'), null);
      const allyEffect = engine.calculationEffectInstanceId('ally', ref('travelershandysword.healing'), null);
      const formulaExists = engine.grantedBuildEffects(owner).some(({ effect: entry }) => entry.identity.id === entity + '.curse-healing');
      const cases = [['actor', true, true], ['ally', true, true], ['actor', false, true],
        ['actor', null, true], ['actor', true, false], ['actor', true, null]];
      for (const [recipient, triggered, applied] of cases) {
        const frame = { ...request.frame, ownerId: recipient, recipientId: recipient, contributorId: null,
          hit: { skillId: talent.id, hitId: hit.id, category: hit.category, element: hit.element, family: 'ordinary', origin: 'talent', reactionId: null },
          facts: { [entity + '.curseTriggered']: triggered === null ? fact(null) : bool(triggered) },
          applications: recipient === 'ally' ? [{ instanceId: allyEffect, active: false }]
            : formulaExists ? [{ instanceId: effect, active: applied }] : [] };
        const reading = engine.evaluateCombatBindings(compiled.team.program, context, { value: healing }, frame);
        const output = reading.outputs.value;
        const expectedStatus = fraction && recipient === 'actor' && (triggered === null || applied === null) ? 'unknown' : 'known';
        const expected = expectedStatus === 'unknown' ? null
          : recipient === 'actor' && triggered && applied ? sourceAttack(owner) * fraction * (gear ? 1 + maiden + doctor : 1) : 0;
        const actualStatus = formulaExists === Boolean(fraction) ? output?.state ?? 'missing' : 'grant-mismatch';
        const value = output?.state === 'known' && output.value.kind === 'quantity' && output.value.unit === 'hp' ? output.value.value : null;
        record({ ...sword, level, ascension, recipient, triggered, applied, expectedStatus, expected }, value, actualStatus,
          null, reading.diagnostics.map(diagnostic => diagnostic.message));
      }
    }
  }
  const verified = new Set([...Map.groupBy(rows, row => row.entity + row.field)].filter(([, checks]) => checks.every(row => !row.issue)).map(([key]) => key));
  for (const [report, resolution, remaining] of [
    [kuki, '安心之所解锁后，越祓草轮的基础治疗量增加施救者元素精通的75%，并承接施救者治疗加成及受益者受治疗加成。', null],
    [vody, '单次治疗按受益者治疗前的生命比例判断。四命低于40%时，固定值和施救者生命上限系数各乘1.5，再乘以（1＋施救者治疗加成＋受益者受治疗加成）。40%及以上的本次治疗沿用已生效的生命层数。',
      '较高生命分支层数的自动授予与独立到期仍需核验。'],
    ...swordReports.map(sword => [sword, sword.fraction ? '确认祟灵触发后，持有者恢复100%攻击力的生命值。' : '破碎版本的祟灵不授予自疗。',
      sword.fraction ? '连续攻击的自动触发及实际恢复到账量待核验。' : null]),
  ]) {
    const { entity, field, sources, output } = report;
    if (!verified.has(entity + field)) continue;
    resolved.push({ entity, field, sources, ...(output && { output }), resolved: resolution, remaining });
    if (remaining) gaps.push({ entity, field, sources, ...(output && { output }), reason: remaining });
  }
  return { rows, verified, resolved, gaps, summary: { conditionalHealingCases: rows.length,
    conditionalHealingMismatches: rows.filter(row => row.issue).length, verifiedConditionalHealingFields: verified.size, conditionalHealingGaps: gaps.length } };
}
