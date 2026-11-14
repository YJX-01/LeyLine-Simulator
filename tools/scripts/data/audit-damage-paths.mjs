import { resolve } from 'node:path';
import { damagePathAudit } from '../../lib/damage-path-audit.mjs';
import { readContentSource } from '../../lib/content-source.mjs';

if (process.argv.length > 2) throw new Error('This audit is read-only and no longer writes stage documents.');
const root = resolve(import.meta.dirname, '../../..');
const read = path => readContentSource(resolve(root, path));
const manifest = read('src/game-data/data/manifest.json');
const audit = damagePathAudit(manifest, manifest.characters.map(id => read(`src/game-data/data/characters/${id}.json`)));
console.log(JSON.stringify(audit.summary));
