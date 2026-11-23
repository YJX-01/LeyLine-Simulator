import { readContentSource } from './content-source.mjs';
import { auditBuild, auditHit, bool, elements, fact, novice, number, projectQuery } from './roster-audit-settings.mjs';

const sourceRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/';
const libraryRoot = 'kqm-theorycrafting-library@7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5:';
const read = path => readContentSource(new URL('../../' + path, import.meta.url));
const sourceFacts = read('tools/data/sources/kqm-tcl/7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5/party-infusion-facts.json');
const stats = read(sourceRoot + 'stats/talents.json');
const characterGrowth = read('tools/data/sources/catalog/genshin-db/characters.json');
const weaponGrowth = read('tools/data/sources/catalog/genshin-db/weapons.json');
const resistances = Object.fromEntries(elements.map(element => [element, { physical: .1, pyro: .25, hydro: .4, cryo: .15, geo: .3 }[element] ?? .2]));
const close = (actual, expected) => typeof actual === 'number' && Math.abs(actual - expected) < 1e-8;
const sourceStat = (id, key) => characterGrowth[id].stats.base[key];

/** Source ratios, explicit current elements and distinct target resistances for software-only checks. */
export function auditPartyInfusion(entities, engine) {
  const characters = new Map(entities.characters.map(character => [character.id, character]));
  const weapons = new Map(entities.weapons.map(weapon => [weapon.id, weapon]));
  const rows = [], verified = new Set();

  function probe({ recipient = 'kaeya', output = 'normal.param1', sourceTalent = 'combat1', param = 'param1', teammates = [], choice,
    expectedElement, weapon = true, reaction = 'none', validReaction = true, activeNoelle = false, castCandace = false }) {
    const character = characters.get(recipient);
    const weaponId = novice[character.identity.weaponType];
    const build = auditBuild(character, weapon ? weapons.get(weaponId) : null);
    const [talent] = character.talents.filter(entry => entry.hits.some(hit => hit.id === recipient + '.' + output));
    const hit = talent.hits.find(entry => entry.id === recipient + '.' + output);
    const { request } = auditHit(character, talent, hit);
    if (choice) request.frame.facts.partyInfusion = fact({ kind: 'enum', value: choice });
    const ownerFacts = request.frame.factOverrides[0].facts;
    const rawDefense = sourceStat(recipient, 'defense');
    if (activeNoelle) {
      ownerFacts['noelle.sweepingTime'] = bool(true);
      ownerFacts['noelle.defenseAtSweeping'] = number('defense', rawDefense);
    }
    const actors = [{ id: 'owner', character: recipient, weapon: weapon ? weaponId : 'none', inputs: {}, build }];
    for (const [id, rank = 0, hasBuild = true] of teammates) {
      const ally = characters.get(id), allyWeapon = novice[ally.identity.weaponType];
      actors.push({ id, character: id, weapon: allyWeapon, element: ally.identity.element, inputs: {},
        ...(hasBuild ? { build: { ...auditBuild(ally, weapons.get(allyWeapon)), constellation: rank } } : {}) });
    }
    const damage = projectQuery(request);
    damage.reaction = reaction === 'none' ? 'none' : { type: reaction, trigger: 'record-owner' };
    const timeline = [{ id: 'hit', actor: 'owner', timeMs: 1, order: 1, kind: 'damage', definition: 'damage', damage }];
    if (castCandace) timeline.unshift({ id: 'candace-cast', actor: 'candace', timeMs: 0, order: 0, kind: 'action',
      skillId: 'candace.burst', definition: 'candace.burst' });
    const definition = id => ({ id, name: id, version: character.dataVersion, source: { kind: 'preset', reference: character.dataVersion, verified: false }, nodes: [], effects: [] });
    const references = new Set([...actors.flatMap(actor => [actor.character, actor.weapon]), ...timeline.map(record => record.definition)]);
    const definitions = [...references].filter(id => id !== 'damage').map(definition);
    definitions.push({ ...definition('damage'), nodes: [{ id: 'hit', op: 'game-damage' }], damage: 'hit' });
    const project = { schemaVersion: character.schemaVersion, rulesVersion: 'timeline-v1', id: 'party-infusion-audit', revision: '1',
      definitions, candidate: { id: 'team', actors }, conditions: {}, enemy: { level: 1, defenseReduction: 0, defenseIgnore: 0, resistances }, timeline, objective: {} };
    const calculated = engine.evaluateTimeline(project);
    const actual = calculated.points.find(point => point.id === 'hit')?.real;
    const ratio = stats[recipient][sourceTalent][param][0];
    const attack = sourceStat(recipient, 'attack') + (weapon ? weaponGrowth[weaponId].stats.base.attack : 0)
      + (activeNoelle ? rawDefense * stats.noelle.combat3.param3[0] : 0);
    const resistance = 1 - resistances[expectedElement];
    const bonus = castCandace && expectedElement !== 'physical' && hit.category === 'normal' ? stats.candace.combat3.param3[0] : 0;
    const amplification = reaction === 'vaporize' && expectedElement === 'hydro' ? 2 : 1;
    const expected = validReaction ? attack * ratio * (1 + bonus) * .5 * resistance * amplification : null;
    const value = actual?.value ?? null;
    const valid = validReaction ? close(value, expected) && close(actual.parts.multiplier, ratio) && close(actual.parts.resistance, resistance)
      && close(actual.panel.attributes.damageBonus, bonus) && (reaction === 'none' || actual.reaction?.element === expectedElement)
      : actual?.status === 'invalid' && value === null && actual.structured?.outputs.length > 0;
    return { expected, value, ratio, resistance, expectedElement, bonus, status: actual?.status ?? calculated.status,
      ...(!valid ? { issue: '本击属性转化、抗性、反应或面板与独立期望不符', diagnostics: calculated.diagnostics } : {}) };
  }

  function verify(index, field, cases) {
    const grant = sourceFacts.grants[index], entity = grant.character;
    if (!characters.has(entity)) return;
    const sources = [sourceRoot + grant.inGameText, libraryRoot + sourceFacts.source.mechanics];
    for (const [label, settings, overlap] of cases) {
      const inputs = [...sources, sourceRoot + 'stats/talents.json#' + (settings.recipient ?? 'kaeya')];
      if (overlap) inputs.push(libraryRoot + sourceFacts.source.overlapEvidence, overlap.video);
      rows.push({ entity, field, probe: label, settings, sources: inputs, ...probe(settings) });
    }
    if (rows.filter(row => row.entity === entity && row.field === field).every(row => !row.issue)) verified.add(entity + field);
  }

  const bennett = ['bennett', 6], candace = ['candace'], chongyun = ['chongyun'];
  verify(0, '/constellations/5/partyInfusion', [
    ['满命美妙旅程的普通攻击火附魔', { teammates: [bennett], choice: 'pyro', expectedElement: 'pyro' }],
    ['五命配装的火附魔不可用', { teammates: [['bennett', 5]], choice: 'pyro', expectedElement: 'physical' }],
    ['当前选无', { teammates: [bennett], choice: 'none', expectedElement: 'physical' }],
    ['未记录本击附魔的旧文件', { teammates: [bennett], expectedElement: 'physical' }],
    ['安柏的弓箭命中', { recipient: 'amber', teammates: [bennett], choice: 'pyro', expectedElement: 'physical' }],
    ['未装武器的凯亚', { teammates: [bennett], weapon: false, choice: 'pyro', expectedElement: 'physical' }],
  ]);
  verify(1, '/talents/2/partyInfusion', [
    ['坎蒂丝爆发使凯亚普攻水附魔并可触发蒸发', { teammates: [candace], choice: 'hydro', expectedElement: 'hydro', reaction: 'vaporize' }],
    ['同一击无附魔不能蒸发', { teammates: [candace], choice: 'none', expectedElement: 'physical', reaction: 'vaporize', validReaction: false }],
    ['缺少坎蒂丝配装时水附魔不可用', { teammates: [['candace', 0, false]], choice: 'hydro', expectedElement: 'physical' }],
    ['水附魔普攻读取赤冕祝祷加成', { teammates: [candace], choice: 'hydro', expectedElement: 'hydro', castCandace: true }],
    ['赤冕祝祷下已确认水附魔的重击', { teammates: [candace], output: 'normal.param6', param: 'param6', choice: 'hydro', expectedElement: 'hydro', castCandace: true }],
    ['与满命班尼特同时生效，本击已判为水', { teammates: [bennett, candace], choice: 'hydro', expectedElement: 'hydro' }, sourceFacts.overlapExamples[0]],
    ['同队另一次明确记录无附魔', { teammates: [bennett, candace], choice: 'none', expectedElement: 'physical' }],
  ]);
  verify(2, '/talents/1/partyInfusion', [
    ['重云战技使普攻冰附魔', { teammates: [chongyun], choice: 'cryo', expectedElement: 'cryo' }],
    ['重云战技使下落攻击冰附魔', { teammates: [chongyun], output: 'normal.param9', param: 'param9', choice: 'cryo', expectedElement: 'cryo' }],
    ['冰附魔不能蒸发', { teammates: [chongyun], choice: 'cryo', expectedElement: 'cryo', reaction: 'vaporize', validReaction: false }],
    ['班尼特满命火附魔不改重云战技伤害', { recipient: 'chongyun', output: 'skill.param1', sourceTalent: 'combat2', teammates: [bennett], choice: 'pyro', expectedElement: 'cryo' }],
    ['诺艾尔生效的大扫除保持岩元素', { recipient: 'noelle', teammates: [chongyun], choice: 'cryo', expectedElement: 'geo', activeNoelle: true }],
    ['诺艾尔无大扫除时双手剑附上冰元素', { recipient: 'noelle', teammates: [chongyun], choice: 'cryo', expectedElement: 'cryo' }],
    ['重云战技使坎蒂丝的长柄武器冰附魔', { recipient: 'candace', teammates: [chongyun], choice: 'cryo', expectedElement: 'cryo' }],
    ['与坎蒂丝同时生效，本击已判为冰', { teammates: [candace, chongyun], choice: 'cryo', expectedElement: 'cryo' }, sourceFacts.overlapExamples[1]],
  ]);
  return { rows, verified, summary: { cases: rows.length, verified: verified.size, failures: rows.filter(row => row.issue).length } };
}
