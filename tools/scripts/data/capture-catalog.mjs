import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, resolve, relative, isAbsolute } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const commit = '8e5badd60b5d894284ccc927a56c9683529d2592';
const reference = resolve(root, '.references/genshin-db');
if (execFileSync('git', ['-C', reference, 'rev-parse', 'HEAD'], {encoding:'utf8'}).trim() !== commit) throw new Error('Review the changed upstream commit before capture.');
const output = resolve(root, process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? `artifacts/content-candidates/source-${Date.now()}`);
const inside = relative(resolve(root, 'artifacts/content-candidates'), output);
if (!inside || inside.startsWith('..') || isAbsolute(inside)) throw new Error('Capture output must be a new directory within artifacts/content-candidates.');
mkdirSync(dirname(output),{recursive:true});
mkdirSync(output, {recursive:false});
const adopted = JSON.parse(readFileSync(resolve(root, `tools/data/sources/genshin-db/${commit}/adopted-files.json`), 'utf8'));
const files = {};
for (const path of [...adopted.files, 'stats/characters.json', 'stats/weapons.json', 'curve/characters.json', 'curve/weapons.json']) {
  const source = resolve(reference, 'src/data', path), destination = resolve(output, path);
  mkdirSync(dirname(destination), {recursive:true}); copyFileSync(source, destination);
  files[path] = {sha256:createHash('sha256').update(readFileSync(source)).digest('hex')};
}
writeFileSync(resolve(output,'manifest.json'),JSON.stringify({repository:'theBowja/genshin-db',commit,files},null,2)+'\n');
console.log(`Captured candidate source bytes at ${relative(root,output)}. Canonical content was not changed.`);
