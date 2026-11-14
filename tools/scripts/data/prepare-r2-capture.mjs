import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { readContentSource, writeContentSource } from '../../lib/content-source.mjs';

const root = resolve(import.meta.dirname, '../../..');
const output = resolve(root, 'artifacts/content-candidates/r2-capture-2026-11-14');
const db = '8e5badd60b5d894284ccc927a56c9683529d2592';
const tcl = '7fb4e7d54d38e9e7549f778ac9bdcfc626c646d5';
const canonical = resolve(root, 'src/game-data/data/characters/kaeya.json');
if (process.argv.includes('--adopt')) {
  const candidate = readContentSource(resolve(output, 'kaeya.json'));
  const current = readContentSource(canonical);
  const before = readContentSource(resolve(output, 'before.json'));
  if (JSON.stringify(current) !== JSON.stringify(before) && JSON.stringify(current) !== JSON.stringify(candidate)) throw new Error('Canonical content changed after preparation; review a fresh candidate.');
  writeContentSource(canonical, candidate);
  writeContentSource(resolve(root, `tools/data/sources/kqm-tcl/${tcl}/r2-independent-capture.json`), readContentSource(resolve(output, 'review.json')));
  console.log('Adopted reviewed Kaeya C0-C1 icicle query candidate; generation is separate.');
} else {
  strictEqual(execFileSync('git', ['-C', resolve(root, '.references/kqm-tcl'), 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), tcl);
  const character = readContentSource(canonical);
  const before = structuredClone(character);
  if (!['5', '6'].includes(character.revision)) throw new Error('Review changed Kaeya revision before preparing.');
  const raw = readContentSource(resolve(root, `tools/data/sources/genshin-db/${db}/ChineseSimplified/talents/kaeya.json`));
  const constellations = readContentSource(resolve(root, `tools/data/sources/genshin-db/${db}/ChineseSimplified/constellations/kaeya.json`));
  for (const [index, passive] of character.passives.entries()) strictEqual(passive.description, raw[`passive${index + 1}`].description);
  for (const constellation of character.constellations) strictEqual(constellation.description, constellations[`c${constellation.rank}`].description);
  const burst = character.talents.find(talent => talent.id === 'kaeya.burst');
  const stats = readContentSource(resolve(root, `tools/data/sources/genshin-db/${db}/stats/talents.json`));
  deepStrictEqual(burst.parameters.find(parameter => parameter.id === 'param1').values, stats.kaeya.combat3.param1);
  const text = readFileSync(resolve(root, '.references/kqm-tcl/docs/characters/cryo/kaeya.md'), 'utf8');
  if (!text.includes('| Snapshot            | Snapshot |') || !text.includes('131.92%')) throw new Error('Review changed burst source.');
  character.revision = '6';
  character.damageCoverage = (character.damageCoverage ?? []).filter(proof => proof.id !== 'kaeya-burst-r2').map(proof => ({ ...proof, revision: '6' }));
  const sources = [
    { repository: 'theBowja/genshin-db', commit: db, path: 'src/data/ChineseSimplified/talents/kaeya.json' },
    { repository: 'theBowja/genshin-db', commit: db, path: 'src/data/ChineseSimplified/constellations/kaeya.json' },
    { repository: 'KQM-git/TCL', commit: tcl, path: 'docs/characters/cryo/kaeya.md' },
  ];
  character.damageCoverage.push({ id: 'kaeya-burst-r2', revision: '6', skillId: 'kaeya.burst', hitIndices: [0], maxConstellation: 1, sources, branches: [
    { id: 'base', resolution: 'explicit-input', reason: '零至一命已明确记录的单次冰棱伤害；攻击力、暴击和冰伤依照命中snapshot从显式来源时刻读取，不自动推导施放、延迟、冰棱命中数或持续可执行性。' },
    { id: 'kaeya.passive1', resolution: 'irrelevant', reason: '霜袭命中后的治疗不修饰冰棱伤害；不交付治疗。' },
    { id: 'kaeya.passive2', resolution: 'irrelevant', reason: '霜袭冻结额外微粒不修饰冰棱单次伤害；充能和施放可行性未证明。' },
    { id: 'kaeya.passive3', resolution: 'irrelevant', reason: '冲刺体力消耗不改变本次冰棱伤害。' },
    { id: 'constellation:1', resolution: 'irrelevant', reason: '目标冰附着下的暴击率仅作用普通攻击和重击，不作用爆发冰棱；未扩展普攻支持。' },
  ] });
  mkdirSync(output, { recursive: true });
  writeContentSource(resolve(output, 'before.json'), before);
  writeContentSource(resolve(output, 'kaeya.json'), character);
  writeContentSource(resolve(output, 'review.json'), { sources, scope: 'Kaeya C0-C1 single icicle; explicit independent read anchor; existing E C0-C3 proof retained at revision6', talent9: 1.3192,
    captureDelayAdopted: false, actionsOrHitsGenerated: false, playerRecordsOrObservations: false,
    excluded: ['C2-C6 burst', 'cast feasibility and duration validation', 'contribution-level dynamic/snapshot separation', 'Xingqiu wave generation', 'trigger counts and cooldowns'],
    review: '固定来源的爆发倍率、捕获分类、全部被动及C1已读；独立取值点只表达用户确认时刻，不冒充施放，不触发动作或伤害规则。数值定义及E证明保持原语义。' });
  console.log('Prepared Kaeya revision6 and review.json only. Review before --adopt.');
}
