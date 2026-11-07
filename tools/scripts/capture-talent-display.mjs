import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const reference = new URL('.references/genshin-db/', root);
const commit = '8e5badd60b5d894284ccc927a56c9683529d2592';
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: reference, encoding: 'utf8' }).trim() !== commit) throw new Error('Use the pinned genshin-db reference.');
const directory = new URL('src/data/ChineseSimplified/', reference);
const characters = {};
for (const file of readdirSync(new URL('talents/', directory)).sort()) {
  const talents = JSON.parse(readFileSync(new URL(`talents/${file}`, directory), 'utf8'));
  let constellations;
  try { constellations = JSON.parse(readFileSync(new URL(`constellations/${file}`, directory), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  characters[talents.name] = ['normal', 'skill', 'burst'].map((key, index) => {
    const name = talents[`combat${index + 1}`]?.name ?? '';
    const ranks = Array.from({ length: 6 }, (_, i) => i + 1).filter(rank => {
      const description = constellations[`c${rank}`]?.description ?? '';
      return name && description.includes(name) && description.includes('技能等级提高3级');
    });
    return { key, label: 'AEQ'[index], icon: `${file.slice(0, -5)}-combat${index + 1}`, name, constellations: ranks };
  });
}
const output = { source: { repository: 'theBowja/genshin-db', commit, method: 'ChineseSimplified talents combat1–3 names matched against constellation descriptions containing 技能等级提高3级' }, characters };
const target = new URL('src/web/src/domain/data/character-talent-display.json', root);
const text = `${JSON.stringify(output, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== text) throw new Error('Talent display metadata needs regeneration.');
} else writeFileSync(target, text);
console.log(`Talent display metadata: ${Object.keys(characters).length} characters.`);
