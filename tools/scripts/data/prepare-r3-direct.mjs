import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { readContentSource, writeContentSource } from '../../lib/content-source.mjs';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'artifacts/content-candidates/r3-direct-2026-11-14');
const db = '8e5badd60b5d894284ccc927a56c9683529d2592';
const tcl = '7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5';
// These are authored semantic reviews, never classifications inferred from text or support flags.
const reviews = {
  noelle: { element: 'geo', skill: 'skill', indices: [0], max: 3, branches: [
    ['base', 'irrelevant', '护心铠施放单次岩伤动态读取防御力；大扫除的防御转攻击不改变此防御缩放，不交付护盾和治疗量。'],
    ['noelle.passive1', 'irrelevant', '后台濒血护盾不改变护心铠施放伤害。'],
    ['noelle.passive2', 'irrelevant', '普攻重击命中减少战技冷却，不改变此次伤害；不证明施放可行性。'],
    ['noelle.passive3', 'irrelevant', '防御食物烹饪产出不改变本次伤害。'],
    ['constellation:1', 'irrelevant', '双状态提高治疗触发率，不改变本次岩伤。'],
    ['constellation:2', 'irrelevant', '重击体力和伤害增益不修饰战技。'],
    ['constellation:3', 'talent-level', '战技加3级，使用共同talentLevelBonus和原参数表。'],
  ], excluded: 'C4护盾结束额外命中、C5—6及普攻强化、转换和护盾治疗仍未交付。' },
  xinyan: { element: 'pyro', skill: 'skill', indices: [0], max: 3, branches: [
    ['base', 'irrelevant', '仅热情拂扫初始挥舞火伤，动态攻击缩放；护盾等级和存在性不改变此挥舞倍率，不计算后续脉冲。'],
    ['xinyan.passive1', 'irrelevant', '减少护盾所需命中敌人数，不改变初始挥舞火伤。'],
    ['xinyan.passive2', 'irrelevant', '护盾保护下物理伤害提高，不作用本次火伤。'],
    ['xinyan.passive3', 'irrelevant', '防御食物烹饪产出不改变本次伤害。'],
    ['constellation:1', 'irrelevant', '暴击后的普攻重击攻速不改变战技挥舞伤害。'],
    ['constellation:2', 'irrelevant', '爆发物理暴击与生成三级盾不修饰战技初始挥舞；脉冲存在性不在本证明内。'],
    ['constellation:3', 'talent-level', '战技加3级，使用共同talentLevelBonus和原参数表。'],
  ], excluded: 'E脉冲、Q、护盾等级及C4—6未交付，不从初始挥舞外推。' },
  razor: { element: 'electro', skill: 'skill', indices: [0, 1], max: 0, branches: [
    ['base', 'irrelevant', '点按和长按战技分别为动态攻击缩放单次雷伤；雷之印提高充能与长按能量返还，不是伤害层数；雷牙协同伤害仅跟随普攻，不为E生成协同命中。'],
    ['razor.passive1', 'irrelevant', '减冷却及爆发重置冷却不改变E伤害；未证明施放可行性。'],
    ['razor.passive2', 'irrelevant', '低能量提高元素充能效率，不改变本次E伤害。'],
    ['razor.passive3', 'irrelevant', '冲刺体力消耗不改变本次伤害。'],
  ], excluded: 'C1拾取微粒全伤害、C2目标生命暴击及后续命座未实现；所有非零命继续阻断。' },
  barbara: { element: 'hydro', skill: 'normal', indices: [0, 1, 2, 3, 4, 5, 6, 7], max: 1, branches: [
    ['base', 'irrelevant', '水元素普通、重击及下落单次命中动态攻击缩放；仅用户选择的命中类型，不自动生成四段连击、命中次数或治疗。'],
    ['barbara.passive1', 'irrelevant', '歌声之环减少体力消耗，不改变普攻族单次伤害。'],
    ['barbara.passive2', 'irrelevant', '获取微粒延长歌声之环，不改变C0—C1普攻族伤害；不外推C2水伤增益。'],
    ['barbara.passive3', 'irrelevant', '治疗食物烹饪产出不改变本次伤害。'],
    ['constellation:1', 'irrelevant', '每10秒恢复能量，不改变普攻族单次伤害。'],
  ], excluded: 'C2歌声之环期间站场角色15%水伤尚未实现，C2以上阻断；E及治疗未由本证明开放。' },
};
const read = path => readContentSource(resolve(root, path));
if (process.argv.includes('--adopt')) {
  for (const id of Object.keys(reviews)) {
    const current = read(`src/game-data/data/characters/${id}.json`), candidate = read(`artifacts/content-candidates/r3-direct-2026-11-14/${id}.json`);
    if (JSON.stringify(current) !== JSON.stringify(read(`artifacts/content-candidates/r3-direct-2026-11-14/${id}-before.json`)) && JSON.stringify(current) !== JSON.stringify(candidate)) throw new Error(`Canonical changed since preparation: ${id}`);
  }
  for (const id of Object.keys(reviews)) writeContentSource(resolve(root, `src/game-data/data/characters/${id}.json`), read(`artifacts/content-candidates/r3-direct-2026-11-14/${id}.json`));
  writeContentSource(resolve(root, `tools/data/sources/kqm-tcl/${tcl}/r3-direct-queries.json`), read('artifacts/content-candidates/r3-direct-2026-11-14/review.json'));
  console.log('Adopted the four explicitly reviewed query candidates. Support flags and numeric fields are unchanged.');
} else {
  strictEqual(execFileSync('git', ['-C', resolve(root, '.references/kqm-tcl'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tcl);
  mkdirSync(output, { recursive: true });
  const stats = read(`tools/data/sources/genshin-db/${db}/stats/talents.json`);
  const facts = [];
  for (const [id, review] of Object.entries(reviews)) {
    const character = read(`src/game-data/data/characters/${id}.json`);
    if (!['3', '4'].includes(character.revision)) throw new Error(`Review changed revision: ${id}`);
    writeContentSource(resolve(output, `${id}-before.json`), character);
    const raw = read(`tools/data/sources/genshin-db/${db}/ChineseSimplified/talents/${id}.json`);
    const constellations = read(`tools/data/sources/genshin-db/${db}/ChineseSimplified/constellations/${id}.json`);
    for (const [index, passive] of character.passives.entries()) strictEqual(passive.description, raw[`passive${index + 1}`].description);
    for (const constellation of character.constellations) strictEqual(constellation.description, constellations[`c${constellation.rank}`].description);
    const talent = character.talents.find(talent => talent.id === `${id}.${review.skill}`);
    const combat = review.skill === 'normal' ? 'combat1' : 'combat2';
    for (const parameter of talent.parameters) deepStrictEqual(parameter.values, stats[id][combat][parameter.id]);
    const tclPath = `docs/characters/${review.element}/${id}.md`;
    if (!readFileSync(resolve(root, `.references/kqm-tcl/${tclPath}`), 'utf8').includes('Talent 9%') && id === 'barbara') throw new Error('Review changed Barbara normal table.');
    const sources = [
      { repository: 'theBowja/genshin-db', commit: db, path: `src/data/ChineseSimplified/talents/${id}.json` },
      { repository: 'theBowja/genshin-db', commit: db, path: `src/data/ChineseSimplified/constellations/${id}.json` },
      { repository: 'theBowja/genshin-db', commit: db, path: 'src/data/stats/talents.json' },
      { repository: 'KQM-git/TCL', commit: tcl, path: tclPath },
    ];
    character.revision = '4';
    character.damageCoverage = [{ id: `${id}-${review.skill}-r3`, revision: '4', skillId: talent.id, hitIndices: review.indices, maxConstellation: review.max, sources,
      branches: review.branches.map(([id, resolution, reason]) => ({ id, resolution, reason })) }];
    writeContentSource(resolve(output, `${id}.json`), character);
    facts.push({ id, skill: talent.id, hitIndices: review.indices, maxConstellation: review.max, sources, branches: review.branches, remaining: review.excluded,
      coefficientsAt9: review.indices.map(index => talent.parameters.find(parameter => parameter.id === talent.hits[index].parameter).values[8]),
      method: '逐项阅读固定原文和KQM角色表，数值直接比较采用源；只采用所列路径的查询证明，不复制社区实现。' });
  }
  writeContentSource(resolve(output, 'review.json'), { facts, playerRecords: false, gameObservations: false, generatedActionsOrHitSequences: false });
  console.log('Prepared four character candidates and review.json only. Review the exact branches and exclusions before --adopt.');
}
