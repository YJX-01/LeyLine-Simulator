import { readContentSource } from './content-source.mjs';

const sourceRoot = 'tools/data/sources/genshin-db/8e5badd60b5d894284ccc927a56c9683529d2592/ChineseSimplified/';
const staminaModes = {
  glide: ['滑翔', ['amber', 'collei', 'venti']],
  swim: ['游泳', ['beidou', 'sangonomiyakokomi']],
  climb: ['攀爬', ['candace', 'xiao']],
  sprint: ['冲刺', ['chevreuse', 'kaedeharakazuha', 'kaeya', 'razor', 'shikanoinheizou']],
};
const resistanceAudit = 'characterResistanceBonusProofs';
const resistance = (element, amount, cases, index = 0, buff = 0) =>
  [resistanceAudit, 'target.resistance.' + element, -amount, cases, buff, index];
const attackSpeed = (amount, cases) => ['combatSpeedClauses', 'attribute.normalAttackSpeed', amount, cases];
const rosterResistance = (element, amount, cases) =>
  ['currentRosterBuffs', 'target.resistance.' + element, -amount, cases];
const ignore = (audit, amount, cases, buff = 0) => [audit, 'attribute.defenseIgnore', amount, cases, buff];
const movementSpeed = (amount, cases, buff = 0) => ['movementSpeedClauses', 'attribute.movementSpeed', amount, cases, buff];
const normalize = text => text.replaceAll('**', '').trim();
const close = (actual, expected) => Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-8;

// Each rule names the exact source statement and the specific authored outputs checked by its audit.
const rules = [
  ...Object.entries(staminaModes).flatMap(([output, [action, ids]]) => ids.map(id => [
    id, '/passives/2', `队伍中自己的角色${action}消耗的体力降低20%`,
    [['characterBuffs', 'attribute.staminaCostReduction.' + output, 0.2, 24]],
  ])),
  ['yaemiko', '/constellations/5', '杀生樱在攻击时无视敌人60%的防御力', [ignore('characterBuffs', 0.6, 78)]],
  ['raidenshogun', '/constellations/1', '奥义·梦想真说的梦想一刀与梦想一心状态下的雷电将军的攻击将无视敌人60%的防御力',
    [ignore('characterReactionUtilityNumbers', 0.6, 5)]],
  ['nicole', '/constellations/5', '此外，拥有圣祝之引的角色造成的伤害将无视敌人40%的防御力',
    [ignore('characterReactionUtilityNumbers', 0.4, 3)]],
  ['durin', '/constellations/5', '杜林造成的元素爆发伤害将无视敌人30%的防御力',
    [ignore('lastCharacterModifiers', 0.3, 3, 1)]],
  ['durin', '/constellations/5', '元素爆发黑度法·如星阴燃与「黑蚀之龙」造成的伤害将额外无视敌人40%的防御力',
    [ignore('lastCharacterModifiers', 0.4, 3, 2)], '额外无视敌人40%的防御力'],
  ['chongyun', '/passives/0', '处在灵刃·重华叠霜领域内的单手剑、双手剑、长柄武器角色，普通攻击的攻击速度提升8%', [attackSpeed(0.08, 34)]],
  ['cyno', '/constellations/0', '施放圣仪·煟煌随狼行后，赛诺普通攻击的攻击速度提升20%，持续10秒', [attackSpeed(0.2, 19)]],
  ['kaveh', '/constellations/1', '在繁绘隅穹持续期间，卡维普通攻击的攻击速度提升15%', [attackSpeed(0.15, 14)]],
  ['yunjin', '/constellations/5', '处于「飞云旗阵」状态下的角色，普通攻击的攻击速度提升12%', [attackSpeed(0.12, 22)]],
  ['shikanoinheizou', '/constellations/0', '鹿野院平藏登场后的5秒内，普通攻击的攻击速度提升15%，并获得1层勠心拳的「变格」效果，该效果每10秒最多触发一次',
    [attackSpeed(0.15, 15)], '普通攻击的攻击速度提升15%'],
  ['neuvillette', '/passives/2', '队伍中自己的角色进行水下冲刺时，移动速度提升15%', [movementSpeed(0.15, 4)]],
  ...[['dahlia', 2, 13], ['dehya', 2, 12], ['gaming', 2, 12]].map(([id, index, cases]) => [
    id, '/passives/' + index, '在白天（6时至18时），队伍中自己的角色获得迅行效果：移动速度提高10%', [movementSpeed(0.1, cases)],
  ]),
  ...[['illuga', 3, 12], ['rosaria', 2, 13]].map(([id, index, cases]) => [
    id, '/passives/' + index, '在夜间（18时至6时），队伍中自己的角色获得迅行效果：移动速度提高10%', [movementSpeed(0.1, cases)],
  ]),
  ['chiori', '/passives/2', '队伍中任意自己的角色装备了默认衣装以外的衣装，或初始之翼以外的风之翼时，队伍中自己的角色获得迅行效果：移动速度提升10%',
    [movementSpeed(0.1, 8)]],
  ['kinich', '/constellations/0', '通过悬猎·游骋高狩，基尼奇进行空中摆荡落地后，移动速度提升30%，持续6秒', [movementSpeed(0.3, 7, 1)]],
  ...[['xianyun', 2, 5], ['ororon', 3, 4]].map(([id, index, cases]) => [
    id, '/passives/' + index, '队伍中自己的角色滑翔时移动速度提高15%',
    [['movementSpeedClauses', 'attribute.glideSpeed', 0.15, cases]],
  ]),
  ['chongyun', '/passives/1', '被击中的敌人冰元素抗性降低10%，持续8秒', [resistance('cryo', 0.1, 7)]],
  ['chevreuse', '/passives/0', '夏沃蕾将为队伍中附近的角色施加「协同战法」：角色触发超载反应后，受本次反应影响的敌人的火元素与雷元素抗性降低40%，持续6秒',
    [resistance('pyro', 0.4, 9), resistance('electro', 0.4, 9, 1)], '火元素与雷元素抗性降低40%'],
  ['flins', '/constellations/1', '月兆·满辉：菲林斯在场上时，菲林斯的元素类型为雷元素的攻击命中敌人后，该敌人的雷元素抗性降低25%，持续7秒',
    [resistance('electro', 0.25, 9)]],
  ['ganyu', '/constellations/0', '二段蓄力重击的霜华矢或霜华绽发命中敌人时，会使敌人的冰元素抗性降低15%，持续6秒', [resistance('cryo', 0.15, 8)]],
  ['kinich', '/constellations/1', '基尼奇的元素战技命中敌人时，将使其草元素抗性降低30%，持续6秒', [resistance('dendro', 0.3, 8)]],
  ['lyney', '/constellations/3', '林尼的元素类型为火元素的重击攻击命中敌人后，该敌人的火元素抗性降低20%，持续6秒', [resistance('pyro', 0.2, 10)]],
  ['sigewinne', '/constellations/1', '此外，弹跳水疗法抛出的激愈水球或过饱和心意注射命中敌人后，该敌人的水元素抗性降低35%，持续8秒',
    [resistance('hydro', 0.35, 8)]],
  ['venti', '/constellations/1', '高天之歌会使敌人的风元素抗性与物理抗性降低12%，持续10秒',
    [resistance('anemo', 0.12, 8), resistance('physical', 0.12, 8, 1)]],
  ['rosaria', '/constellations/5', '终命的圣礼的攻击会使敌人的物理抗性降低20%，持续10秒', [rosterResistance('physical', 0.2, 10)]],
  ['xingqiu', '/constellations/1', '此外，受到剑雨攻击的敌人，水元素抗性降低15%，持续4秒', [rosterResistance('hydro', 0.15, 8)]],
  ['navia', '/constellations/3', '如霰澄天的鸣礼命中敌人时，将使该敌人的岩元素抗性降低20%，持续8秒', [rosterResistance('geo', 0.2, 10)]],
  ['beidou', '/constellations/5', '斫雷持续期间，周围敌人的雷元素抗性降低15%', [rosterResistance('electro', 0.15, 9)]],
  ...['aether-electro', 'lumine-electro'].map(id => [
    id, '/constellations/1', '雷轰电转的威光落雷命中敌人后，会使敌人的雷元素抗性降低15%，持续8秒', [rosterResistance('electro', 0.15, 7)],
  ]),
  ['vodyanitsa', '/passives/0', '创造或引爆流荡风旋时，还会使附近敌人的风元素抗性降低35%，持续6秒',
    [rosterResistance('anemo', 0.35, 3)], '风元素抗性降低35%'],
  ['mitya', '/constellations/1', '侦测炉心存在期间，处于极星辉域内的所有敌人冰元素抗性与雷元素抗性降低20%',
    [resistance('cryo', 0.2, 3), resistance('electro', 0.2, 3, 1)], '冰元素抗性与雷元素抗性降低20%'],
  ['nilou', '/constellations/1', '处于「金杯的丰馈」状态下的角色对敌人造成水元素伤害后，该敌人的水元素抗性降低35%，持续10秒',
    [resistance('hydro', 0.35, 6)], '水元素抗性降低35%'],
  ['nilou', '/constellations/1', '对敌人造成绽放或月绽放反应伤害后，该敌人的草元素抗性降低35%，持续10秒',
    [resistance('dendro', 0.35, 6, 1)], '草元素抗性降低35%'],
  ['jean', '/constellations/3', '在蒲公英之风的领域内，所有敌人的风元素抗性下降40%',
    [resistance('anemo', 0.4, 3)], '风元素抗性下降40%'],
];

const authoredRoot = 'src/game-data/data/characters/';
const scope = '按原文和对应修正项核对适用对象、当次数值及排除分支。';
const partialScope = '给定审计所需的当次条件，核对该项数值及排除分支。';

function prove(results, entity, field, buff, ref, [audit, target, amount, minimum, buffIndex = 0, modifier = 0]) {
  const declaration = buff.buffs?.[buffIndex];
  const pointer = `${field}/buffs/${buffIndex}/modifiers/${modifier}`;
  if (declaration?.modifiers?.[modifier]?.target !== target) return;
  const author = `${authoredRoot}${entity}.json#${pointer}`;
  const specialized = results[audit];
  let cases;
  let refs = [];
  if (specialized) {
    const primary = audit === 'characterBuffs' ? field : pointer;
    if (!new Set(specialized.verified).has(entity + primary)) return;
    cases = specialized.rows.filter(row => row.entity === entity && row.field === primary && (
      row.output === target || row.settings?.attribute === target
        || (audit === 'characterBuffs' && (row.settings?.stat === 'defenseIgnore' && target === 'attribute.defenseIgnore'
          || row.settings?.action && target.startsWith('attribute.staminaCostReduction.')))
    ));
    refs = cases.flatMap(row => row.sources ?? (row.source ? [row.source] : []));
  } else {
    const evidence = results.registeredModifierEvidence?.find(row =>
      row.audit === audit && row.entity === entity && row.field === pointer && row.target === target && row.id === declaration.id);
    cases = evidence?.cases ?? [];
    refs = evidence?.refs ?? [];
  }
  if (audit !== 'characterBuffs' && !refs.some(source => {
    const normalized = source.replace('#/', '#');
    return normalized === ref || normalized.startsWith(ref + '/');
  })) return;
  if (cases.length < minimum || cases.some(row => {
    const actual = 'actual' in row ? row.actual : row.value;
    return row.issue || (row.expected === null ? actual !== null : !close(actual, row.expected));
  })
    || !cases.some(row => close(row.expected, amount)) || !cases.some(row => row.expected === 0)) return;
  if (target.startsWith('attribute.staminaCostReduction.')) {
    const mode = target.split('.').at(-1);
    const groups = new Map();
    for (const { settings: { action, recipient, party }, expected } of cases) {
      const key = JSON.stringify([recipient, party]);
      const readings = groups.get(key) ?? new Map();
      readings.set(action, expected);
      groups.set(key, readings);
    }
    if (groups.size !== 6 || [...groups.values()].some(readings => readings.size !== 4
      || Object.keys(staminaModes).some(action => action !== mode && !close(readings.get(mode) - readings.get(action), amount)))) return;
  }
  return { audit, field: pointer, sourceField: field, cases: cases.length, refs: [...new Set([author, ref, ...refs])] };
}

export function makeCharacterMovementDefenseProse(entities, results) {
  const characters = new Map(entities.characters.map(character => [character.id, character.metadata]));
  const descriptions = new Map();
  return (entity, field, statement) => {
    const proofs = [], parts = [];
    for (const [id, sourceField, text, checks, excerpt] of rules) {
      if (id !== entity || sourceField !== field || (statement !== text && (!excerpt || !statement.includes(text)))) continue;
      const [, group, index] = field.split('/');
      const clause = characters.get(entity)?.[group]?.[Number(index)];
      if (!clause?.description || !normalize(clause.description).includes(text)) continue;
      const passive = group === 'passives';
      const anchor = (passive ? 'passive' : 'c') + (Number(index) + 1);
      const sourceId = entity.endsWith('-electro') ? 'travelerelectro' : entity;
      const path = sourceRoot + (passive ? 'talents/' : 'constellations/') + sourceId + '.json';
      const ref = path + '#' + anchor;
      if (!descriptions.has(ref)) descriptions.set(ref, normalize(readContentSource(new URL('../../' + path, import.meta.url))[anchor].description));
      if (!descriptions.get(ref).includes(text)) continue;
      const verified = checks.map(check => prove(results, entity, field, clause, ref, check));
      if (verified.some(proof => !proof)) continue;
      if (excerpt) parts.push(...verified.map(proof => ({ ...proof, text: excerpt, scope: partialScope })));
      else proofs.push(...verified.map(proof => ({ ...proof, scope })));
    }
    return { proofs, parts };
  };
}
