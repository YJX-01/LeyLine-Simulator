import { authoredHitEntries } from '../../src/schema/src/calculation/hit-bindings.mjs';
import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, novice, number, setAuditDefaults, setGateFacts } from './roster-audit-settings.mjs';

const read = path => readContentSource(new URL('../data/sources/' + path, import.meta.url));
const sourceRoot = 'genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const rockcoreSource = 'anime-game-data-2/bd35e243fa436f141f015cf221a6e19d0c34b7ca/geo-traveler-rockcore.json';
const growth = read('catalog/genshin-db/characters.json');
const weaponGrowth = read('catalog/genshin-db/weapons.json');
const characterCurves = read('catalog/genshin-db/character-curves.json');
const talentGrowth = read(sourceRoot + 'stats/talents.json');
const constellationField = '/constellations/1';
const bonusResistances = { geo: .2, anemo: .17, pyro: .31, hydro: .28, cryo: .37, electro: .23, dendro: .42 };
const ascensionLevels = [1, 20, 40, 50];

export const additionalConstellationHitIds = ['aether-geo', 'lumine-geo', 'lynette', 'collei'];

export function auditAdditionalConstellationHits(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const sets = new Map((entities.sets ?? []).map(set => [set.id, set]));
  const rows = [], verified = new Set(), resolved = [], gaps = [];

  for (const entity of additionalConstellationHitIds) {
    const character = characters.get(entity);
    if (!character) continue;
    const geo = entity.endsWith('-geo'), lynette = entity === 'lynette';
    const sourceId = geo ? 'travelergeo' : entity;
    const category = lynette ? 'burst' : 'skill';
    const skillId = entity + '.' + category;
    const hitId = entity + (geo ? '.c2.rockcore-meltdown' : lynette ? '.c2.second-vivid-shot' : '.a0.sprout');
    const field = geo || lynette ? constellationField + '/hits/0' : '/passives/0/hits/0';
    const rockcore = geo ? read(rockcoreSource) : null;
    const constellationFile = sourceRoot + 'ChineseSimplified/constellations/' + sourceId + '.json';
    const talentFile = sourceRoot + 'ChineseSimplified/talents/' + sourceId + '.json';
    const sources = [constellationFile + '#/c2/description', talentFile, sourceRoot + 'stats/talents.json#/' + sourceId,
      geo ? 'https://library.keqingmains.com/evidence/characters/geo/traveler-geo#geo-traveler-c2-damage'
        : lynette ? 'https://library.keqingmains.com/evidence/characters/anemo/lynette#basic-mechanics'
          : 'https://library.keqingmains.com/evidence/characters/dendro/collei#c2-through-hill-and-copse'];
    if (rockcore) sources.push(rockcoreSource + '#/gadget', rockcoreSource + '#/enableExplosion',
      rockcoreSource + '#/destruction', rockcoreSource + '#/skillParameters', rockcore.placement.url);
    const constellationText = read(constellationFile).c2.description;
    const text = read(talentFile);
    const expectedUnlock = geo || lynette ? 'constellation' : 'ascension';
    const expectedRank = geo || lynette ? 2 : 1;
    const talent = character.talents.find(talent => talent.id === skillId);
    const entry = authoredHitEntries(character.metadata, skillId).find(({ hit }) => hit.id === hitId);
    const base = entry?.hit.base;
    const scaling = Array.isArray(base) && base.length === 1 ? base[0] : undefined;
    const snapshot = entry?.hit.snapshot;
    const explosion = rockcore?.destruction.record.attackEvent.attackInfo;
    const matchesSource = Boolean(talent) && character.metadata.constellations[1]?.description === constellationText
      && entry?.field === field && entry.unlock?.state === expectedUnlock && entry.unlock.rank === expectedRank
      && scaling?.stat === 'attack'
      && (geo ? scaling.parameter === 'param1' && constellationText.includes('等同于星陨剑伤害')
          && text.combat2.attributes.labels.includes('技能伤害|{param1:P}')
          && rockcore.gadgetId.record.id === rockcore.generation.record.gadgetID
          && rockcore.gadget.pointer === '/' + rockcore.gadgetId.record.jsonName
          && rockcore.gadget.record.combat.property.useCreatorProperty === true
          && rockcore.destruction.record.$type === 'TriggerAttackEvent' && explosion.attackTag === 'Elemental_Art'
          && rockcore.destruction.pointer.includes('/' + rockcore.enableExplosion.record.modifierName + '/onKill/')
          && rockcore.unlock.record.some(unlock => unlock.abilityName === rockcore.gadget.record.abilities[0].abilityName
            && unlock.talentParam === rockcore.enableExplosion.record.predicates[0].talentParam)
          && rockcore.skillParameters.record.some(parameter => parameter.abilityName === rockcore.gadget.record.abilities[0].abilityName
            && parameter.paramSpecial === explosion.attackProperty.damagePercentage && parameter.paramDelta === '%1')
          && rockcore.skillRankOne.record.paramList[0] === talentGrowth[sourceId].combat2.param1[0]
          && snapshot?.sourceSkillId === skillId && snapshot.attributes.join(' ') === 'attack critRate critDamage geoBonus'
        : lynette ? scaling.parameter === 'param3' && constellationText.includes('额外发射一枚彩练术弹')
          && text.combat3.attributes.labels.includes('彩练术弹伤害|{param3:F1P}')
          : constellationText.includes('飞叶轮返回时') && constellationText.includes('柯莱攻击力40%')
            && character.metadata.passives[0]?.description === text.passive1.description);
    const before = rows.length;
    rows.push({ entity, field, sources, settings: { hit: hitId, case: 'source' }, value: Number(matchesSource), expected: 1,
      ...(!matchesSource ? { issue: '原文、命中归属或解锁条件与固定来源不符' } : {}) });
    if (!matchesSource) continue;

    const weaponId = novice[character.identity.weaponType];
    const weapon = weapons.get(weaponId);
    if (!weapon) throw new Error(entity + ': 缺少审计用武器 ' + weaponId);
    const stats = growth[geo ? entity.split('-')[0] : entity].stats;
    const damageParameters = talentGrowth[sourceId][lynette ? 'combat3' : 'combat2'];
    const normalHitId = entity + (lynette ? '.burst.param3' : '.skill.param1');
    const ready = geo ? entity + '.rockcoreDestroyed' : lynette ? 'lynette.vividShotFired' : 'collei.sproutWindow';
    const reaction = 'collei.reactionBeforeRingReturn';

    function check(settings, expectedRatio, element, expectedInput) {
      const { rank = 2, ascension = 0, talentLevel = 1, facts = {}, omit, setId, burstTime,
        impactTime = 2000, captureCase, hit = hitId, crit = 'noncritical' } = settings;
      const compiled = talent.hits.find(row => row.id === hit);
      if (!compiled) {
        rows.push({ entity, field, sources, settings: { ...settings, hit }, value: null, expected: expectedRatio, issue: '缺少正式命中' });
        return;
      }
      const set = sets.get(setId);
      const build = auditBuild(character, weapon, set ? [set] : []);
      const level = ascensionLevels[ascension];
      Object.assign(build, { level, ascension, constellation: rank });
      build.talents[category] = talentLevel;
      if (set) build.theoreticalSetSlots = set.slots.slice(0, burstTime === undefined ? 2 : 4).map(slot => ({ slot, setId }));
      const prepared = engine.prepareStructuredBuilds([{ id: 'actor', build }]);
      if (!prepared.ok) throw new Error(entity + ': ' + JSON.stringify(prepared.diagnostics));
      const { request, setup } = auditHit(character, talent, compiled, level);
      const hitEvent = setup.events.find(event => event.id === 'hit');
      const capture = setup.events.find(event => event.kind === 'capture');
      if (burstTime !== undefined) {
        hitEvent.timeMs = impactTime;
        if (capture) capture.timeMs = 500;
        setup.events.push({ id: 'burst', kind: 'action', actorId: 'actor', targetIds: [], timeMs: burstTime, order: 0,
          skillId: entity + '.burst', category: 'burst', sourceEventIds: [], facts: {} });
        setup.events.sort((a, b) => a.timeMs - b.timeMs || a.order - b.order);
      }
      if (captureCase === 'missing') delete request.frame.captures.panel;
      if (captureCase === 'same-time') Object.assign(capture, { timeMs: hitEvent.timeMs, order: hitEvent.order });
      setAuditDefaults(character, request.frame);
      setGateFacts(character, request.frame, facts);
      if (omit) delete request.frame.facts[omit];
      for (const [key, value] of Object.entries(bonusResistances)) setup.targets[0].inputs['resistance.' + key] = number('scalar', value);
      request.critMode = crit;
      const result = engine.evaluateStructuredHit(prepared.team, setup, request);
      const value = result.totals.all.value?.value ?? null;
      const required = result.requiredInputs.map(input => input.key);
      const promotion = stats.promotion[ascension];
      const attackBonus = stats.specialized === 'FIGHT_PROP_ATTACK_PERCENT' ? promotion.specialized : 0;
      const readsCapture = (geo || entity === 'collei') && hit === hitId;
      const burstAttackBonus = burstTime === undefined || burstTime > (readsCapture ? 500 : impactTime) ? 0 : .2;
      const attack = (stats.base.attack * characterCurves[level][stats.curve.attack] + promotion.attack + weaponGrowth[weaponId].stats.base.attack)
        * (1 + attackBonus + burstAttackBonus);
      const setBonus = setId === (lynette ? 'noblesseoblige' : 'goldentroupe') ? .2 : 0;
      const elementBonus = lynette && element === 'anemo' ? promotion.specialized : 0;
      const expected = expectedRatio === null ? null : attack * expectedRatio * (1 + setBonus + elementBonus)
        * (crit === 'critical' ? 1 + stats.base.critdmg : 1) * .5 * (1 - bonusResistances[element]);
      const matches = expected === null ? value === null : value !== null && Math.abs(expected - value) <= Math.max(1e-8, Math.abs(expected) * 1e-9);
      const wrongPrerequisite = expectedInput ? !required.includes(expectedInput) : required.length > 0;
      const issue = !matches || compiled.category !== category || wrongPrerequisite;
      rows.push({ entity, field, sources, settings: { ...settings, hit, element }, value, expected, required, execution: result.execution,
        ...(issue ? { issue: '门槛、伤害类别、元素或数值与独立预期不符' } : {}) });
    }

    let explanation, remaining, missingField;
    if (geo) {
      const ratio = damageParameters.param1[0];
      for (const rank of [0, 1, 2]) check({ rank, facts: { [ready]: true } }, rank === 2 ? ratio : 0, 'geo');
      check({ facts: { [ready]: false } }, 0, 'geo');
      check({ omit: ready }, null, 'geo', ready);
      check({ hit: normalHitId, facts: { [ready]: true } }, ratio, 'geo');
      check({ rank: 5, ascension: 3, talentLevel: 4, facts: { [ready]: true } }, damageParameters.param1[6], 'geo');
      if (sets.has('goldentroupe')) check({ setId: 'goldentroupe', facts: { [ready]: true } }, ratio, 'geo');
      if (sets.has('noblesseoblige')) {
        const build = { setId: 'noblesseoblige', facts: { [ready]: true } };
        check(build, ratio, 'geo');
        check({ ...build, case: '生成时攻击加成，爆炸前到期', burstTime: 300, impactTime: 13000 }, ratio, 'geo');
        check({ ...build, case: '生成后获得攻击加成', burstTime: 1000 }, ratio, 'geo');
      }
      check({ captureCase: 'missing', facts: { [ready]: true } }, null, 'geo', 'panel');
      check({ captureCase: 'same-time', facts: { [ready]: true } }, null, 'geo', 'captureOrder.panel');
      explanation = '荒星完整生成后被摧毁时可选择一次额外岩元素战技伤害，沿用星陨剑等级倍率和荒星生成时的攻击、暴击率、暴击伤害及岩元素伤害加成。';
    } else if (lynette) {
      const ratio = damageParameters.param3[0];
      const readyWith = absorbedElement => ({ [ready]: true, absorbedElement });
      for (const element of ['pyro', 'hydro', 'electro', 'cryo']) check({ facts: readyWith(element) }, ratio, element);
      for (const rank of [0, 1]) check({ rank, facts: readyWith('pyro') }, 0, 'pyro');
      check({ facts: { ...readyWith('pyro'), [ready]: false } }, 0, 'pyro');
      check({ facts: readyWith('none') }, 0, 'anemo');
      check({ facts: readyWith('pyro'), omit: 'absorbedElement' }, null, 'pyro', 'absorbedElement');
      check({ facts: readyWith('pyro'), omit: ready }, null, 'pyro', ready);
      check({ hit: normalHitId, facts: readyWith('hydro') }, ratio, 'hydro');
      for (const parameter of ['param1', 'param2']) {
        check({ hit: skillId + '.' + parameter, facts: readyWith('hydro') }, damageParameters[parameter][0], 'anemo');
      }
      check({ rank: 3, ascension: 3, talentLevel: 4, facts: readyWith('hydro'), crit: 'critical' }, damageParameters.param3[6], 'hydro');
      if (sets.has('noblesseoblige')) {
        check({ setId: 'noblesseoblige', facts: readyWith('pyro') }, ratio, 'pyro');
        check({ setId: 'noblesseoblige', burstTime: 1000, facts: readyWith('pyro') }, ratio, 'pyro');
      }
      if (sets.has('goldentroupe')) check({ setId: 'goldentroupe', facts: readyWith('pyro') }, ratio, 'pyro');
      explanation = '惊奇猫猫盒发射彩练术弹时可选择同一元素、同一倍率的第二枚爆发弹，采用该次命中的面板。';
    } else {
      const ratio = Number(constellationText.match(/柯莱攻击力(\d+)%/)?.[1]) / 100;
      const facts = { [ready]: true, [reaction]: false };
      for (const rank of [0, 1, 2]) check({ rank, ascension: 1, facts }, rank === 2 ? ratio : 0, 'dendro');
      check({ rank: 1, ascension: 1, facts: { ...facts, [reaction]: true } }, ratio, 'dendro');
      check({ ascension: 1, facts, omit: reaction }, ratio, 'dendro');
      check({ rank: 1, ascension: 1, facts, omit: reaction }, null, 'dendro', reaction);
      check({ ascension: 1, facts: { [ready]: false, [reaction]: true } }, 0, 'dendro');
      check({ ascension: 0, facts: { ...facts, [reaction]: true } }, 0, 'dendro');
      check({ ascension: 3, talentLevel: 4, facts }, ratio, 'dendro');
      check({ ascension: 1, hit: normalHitId, facts }, damageParameters.param1[0], 'dendro');
      if (sets.has('goldentroupe')) check({ ascension: 1, setId: 'goldentroupe', facts }, ratio, 'dendro');
      if (sets.has('noblesseoblige')) for (const burstTime of [300, 1000]) {
        check({ ascension: 1, setId: 'noblesseoblige', burstTime, facts }, ratio, 'dendro');
      }
      explanation = '解锁飞叶迴斜后，二命在飞叶轮返回时直接赋予新叶。单次伤害沿用同一个 40% 攻击力命中。';
      missingField = constellationField + '/description';
      remaining = '待接入从施放起至新叶消失前的指定反应延长 3 秒、仅延长一次及重新生成时替换旧新叶的时间线规则。';
      sources.push('https://library.keqingmains.com/evidence/characters/dendro/collei#basic-mechanics');
    }
    if (rows.slice(before).some(row => row.issue)) continue;
    verified.add(entity + field + (geo ? '/base' : ''));
    if (geo) verified.add(entity + field + '/snapshot');
    if (!remaining) verified.add(entity + constellationField);
    resolved.push({ entity, field: constellationField, resolved: explanation, remaining: remaining ?? '' });
    if (remaining) gaps.push({ entity, field: missingField, needed: remaining, reason: remaining, sources });
  }

  return { rows, verified, resolved, gaps, summary: {
    additionalConstellationHitCases: rows.length,
    additionalConstellationHitFailures: rows.filter(row => row.issue).length,
    additionalConstellationHitClausesResolved: resolved.length,
    additionalConstellationHitClausesVerified: resolved.filter(row => !row.remaining).length,
  } };
}
