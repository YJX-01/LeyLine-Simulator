import { mkdtempSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';

const root = resolve(import.meta.dirname, '../../..');
const commit = '8e5badd60b5d894284ccc927a56c9683529d2592';
const reference = resolve(root, '.references/genshin-db');
if (execFileSync('git', ['-C', reference, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim() !== commit) throw new Error('Review the changed upstream commit before capture.');
const candidates = resolve(root, 'artifacts/content-candidates');
const argument = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
let output;
if (argument !== undefined) {
  output = resolve(root, argument);
  const inside = relative(candidates, output);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Capture output must be a new directory within artifacts/content-candidates.');
  mkdirSync(dirname(output), {recursive:true});
  mkdirSync(output);
} else {
  mkdirSync(candidates, {recursive:true});
  output = mkdtempSync(resolve(candidates, 'source-'));
}
const adopted = readContentSource(resolve(root, `tools/data/sources/genshin-db/${commit}/adopted-files.json`));
const files = new Set([...adopted.files, 'stats/characters.json', 'stats/weapons.json', 'curve/characters.json', 'curve/weapons.json']);
for (const path of files) {
  const source = resolve(reference, 'src/data', path), destination = resolve(output, path);
  mkdirSync(dirname(destination), {recursive:true}); copyFileSync(source, destination);
}
console.log(`Captured ${files.size} local source files at ${relative(root,output)}.`);
