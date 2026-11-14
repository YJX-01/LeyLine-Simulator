import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { readContentSource, writeContentSource } from '../../lib/content-source.mjs';

// Explicit reviewed list. Missing fields on other weapons never imply no passive.
const weapons = {
  apprenticesnotes: 'catalysts/apprentices_notes.rs',
  beginnersprotector: 'polearms/beginners_protector.rs',
  huntersbow: 'bows/hunters_bow.rs',
  ironpoint: 'polearms/iron_point.rs',
  oldmercspal: 'claymores/old_mercs_pal.rs',
  pocketgrimoire: 'catalysts/pocket_grimoire.rs',
  seasonedhuntersbow: 'bows/seasoned_hunters_bow.rs',
  wastergreatsword: 'claymores/waster_greatsword.rs',
};
const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'artifacts/content-candidates/r1-entry-2026-11-14');
const dbCommit = '8e5badd60b5d894284ccc927a56c9683529d2592';
const monaCommit = '589ac6919057709924c0c20d5a9d673fe9b0be1a';
const tclCommit = '7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5';
const dbSource = path => ({ repository: 'theBowja/genshin-db', commit: dbCommit, path });
const read = path => readContentSource(resolve(root, path));
if (process.argv.includes('--adopt')) {
  // Adoption is a distinct invocation after reviewing the candidate and review.json.
  for (const [group, ids] of [['weapons', Object.keys(weapons)], ['characters', ['beidou', 'kaeya']]]) {
    for (const id of ids) writeContentSource(resolve(root, `src/game-data/data/${group}/${id}.json`), read(`artifacts/content-candidates/r1-entry-2026-11-14/${group}/${id}.json`));
  }
  const evidence = resolve(root, `tools/data/sources/genshin-db/${dbCommit}/ChineseSimplified/weapons`);
  mkdirSync(evidence, { recursive: true });
  for (const id of Object.keys(weapons)) copyFileSync(resolve(output, `evidence/${id}.json`), resolve(evidence, `${id}.json`));
  const adoptedPath = resolve(root, `tools/data/sources/genshin-db/${dbCommit}/adopted-files.json`);
  const adopted = readContentSource(adoptedPath);
  adopted.files = [...new Set([...adopted.files, ...Object.keys(weapons).map(id => `ChineseSimplified/weapons/${id}.json`)])];
  writeContentSource(adoptedPath, adopted);
  const factDirectory = resolve(root, `tools/data/sources/mona-community/${monaCommit}`);
  mkdirSync(factDirectory, { recursive: true });
  writeContentSource(resolve(factDirectory, 'r1-basic-weapons.json'), read('artifacts/content-candidates/r1-entry-2026-11-14/review.json'));
  console.log('Adopted the explicitly reviewed R1 candidates; no generation performed.');
} else {
  for (const [directory, commit] of [['genshin-db', dbCommit], ['mona-community', monaCommit], ['kqm-tcl', tclCommit]]) {
    strictEqual(execFileSync('git', ['-C', resolve(root, `.references/${directory}`), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), commit);
  }
  mkdirSync(output, { recursive: true });
  for (const group of ['weapons', 'characters', 'evidence']) mkdirSync(resolve(output, group), { recursive: true });
  const stats = read('.references/genshin-db/src/data/stats/weapons.json');
  const curves = read('.references/genshin-db/src/data/curve/weapons.json');
  const reviews = [];
  for (const [id, monaPath] of Object.entries(weapons)) {
    const weapon = read(`src/game-data/data/weapons/${id}.json`);
    const metadata = read(`.references/genshin-db/src/data/ChineseSimplified/weapons/${id}.json`);
    const crossCheck = readFileSync(resolve(root, `.references/mona-community/mona_core/src/weapon/weapons/${monaPath}`), 'utf8');
    strictEqual(metadata.name, weapon.name); strictEqual(metadata.weaponType, weapon.weaponType); strictEqual(metadata.rarity, weapon.rarity);
    strictEqual(stats[id].base.attack, weapon.baseAttack); strictEqual(stats[id].base.specialized, weapon.baseStat);
    deepStrictEqual(stats[id].promotion.map(value => value.attack), weapon.promotion);
    for (let level = 1; level <= 90; level++) {
      strictEqual(curves[level][stats[id].curve.attack], weapon.attackCurve[level]);
      strictEqual(curves[level][stats[id].curve.specialized], weapon.statCurve[level]);
    }
    // Source inspection plus the enumerated semantic review below, not this absence test alone.
    strictEqual(['r1', 'r2', 'r3', 'r4', 'r5'].some(key => Object.hasOwn(metadata, key)), false);
    if (!crossCheck.includes('weapon_sub_stat: None') || !crossCheck.includes('effect: None') || !/fn get_effect[\s\S]+\{\s*None\s*\}/.test(crossCheck)) throw new Error(`Review changed upstream semantics: ${id}`);
    const sources = [dbSource(`src/data/ChineseSimplified/weapons/${id}.json`), { repository: 'TwiceDrop/genshin_artifact', commit: monaCommit, path: `mona_core/src/weapon/weapons/${monaPath}` }];
    weapon.passive = { kind: 'none', sources };
    weapon.support = { supported: true, reason: 'R1逐件审阅：一/二星基础武器，无副属性及被动；等级1至70、突破0至4，精炼1；数值与固定源逐项一致。' };
    writeContentSource(resolve(output, `weapons/${id}.json`), weapon);
    copyFileSync(resolve(root, `.references/genshin-db/src/data/ChineseSimplified/weapons/${id}.json`), resolve(output, `evidence/${id}.json`));
    reviews.push({ id, name: weapon.name, baseAttack: weapon.baseAttack, attackAt70: weapon.baseAttack * weapon.attackCurve[70] + weapon.promotion[4], maxLevel: 70, maxAscension: 4, passive: 'none', basis: '逐件阅读固定中文武器记录；社区对应武器明确返回None，仅作交叉核对；数值独立比较源成长和全部突破。未复制或运行社区代码。', sources });
  }
  for (const id of ['beidou', 'kaeya']) {
    const character = read(`src/game-data/data/characters/${id}.json`);
    const talentText = read(`tools/data/sources/genshin-db/${dbCommit}/ChineseSimplified/talents/${id}.json`);
    const constellationText = read(`tools/data/sources/genshin-db/${dbCommit}/ChineseSimplified/constellations/${id}.json`);
    for (const [index, passive] of character.passives.entries()) {
      strictEqual(passive.name, talentText[`passive${index + 1}`].name);
      strictEqual(passive.description, talentText[`passive${index + 1}`].description);
    }
    for (const constellation of character.constellations) {
      strictEqual(constellation.name, constellationText[`c${constellation.rank}`].name);
      strictEqual(constellation.description, constellationText[`c${constellation.rank}`].description);
    }
    if (!['4', '5'].includes(character.revision)) throw new Error(`Review a new character revision before preparing: ${id}`);
    character.revision = '5';
    const reasons = id === 'beidou' ? [
      ['base', 'explicit-input', '捉浪单次雷伤动态读取攻击力和增伤；param3基础攻击项加param4乘显式0/1/2档；不推导格挡或受击历史。'],
      ['beidou.passive1', 'explicit-input', '完美反击映射到显式counterCharge=2，不与受击次数重复相加。'],
      ['beidou.passive2', 'irrelevant', '最高档反击后增益限后续普攻、重击与攻速，不修饰本次战技伤害。'],
      ['beidou.passive3', 'irrelevant', '游泳体力消耗不修饰本次伤害。'],
    ] : [
      ['base', 'irrelevant', '霜袭为动态攻击力缩放的单次冰伤，攻击成长、天赋参数、命座加级共用正式图。'],
      ['kaeya.passive1', 'irrelevant', '战技命中后的治疗不修饰本次战技伤害；治疗量未交付。'],
      ['kaeya.passive2', 'irrelevant', '冻结触发额外微粒不修饰本次战技伤害，不证明充能轴可执行。'],
      ['kaeya.passive3', 'irrelevant', '冲刺体力消耗不修饰本次伤害。'],
      ['constellation:1', 'irrelevant', '目标冰附着下的暴击率仅作用普攻和重击，不作用战技；普攻未获本证明。'],
      ['constellation:2', 'irrelevant', '击败敌人延长爆发持续时间，不修饰战技单次伤害。'],
      ['constellation:3', 'talent-level', '战技天赋提高3级，复用talentLevelBonus及原参数表，不加到基础天赋存值。'],
    ];
    character.damageCoverage = [{ id: `${id}-skill-r1`, revision: character.revision, skillId: `${id}.skill`, hitIndices: [0], maxConstellation: id === 'kaeya' ? 3 : 0,
      sources: [dbSource(`src/data/ChineseSimplified/talents/${id}.json`), dbSource(`src/data/ChineseSimplified/constellations/${id}.json`), { repository: 'KQM-git/TCL', commit: tclCommit, path: `docs/characters/${id === 'beidou' ? 'electro' : 'cryo'}/${id}.md` }],
      branches: reasons.map(([id, resolution, reason]) => ({ id, resolution, reason })) }];
    writeContentSource(resolve(output, `characters/${id}.json`), character);
  }
  writeContentSource(resolve(output, 'review.json'), { weapons: reviews, characters: ['beidou C0 E, explicit counter tier', 'kaeya C0-C3 E, base talent + unlocked bonus'], semanticReview: 'All passive branches and unlocked C1-C3 for these exact queries reviewed. Other paths remain unreviewed. No player records or game observations supplied.' });
  console.log(JSON.stringify(reviews.map(({ id, name, baseAttack, attackAt70 }) => ({ id, name, baseAttack, attackAt70 })), null, 2));
  console.log('Prepared candidates only. Review before --adopt.');
}
