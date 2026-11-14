import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { damagePathAudit, damagePathMarkdown } from '../../lib/damage-path-audit.mjs';
import { readContentSource } from '../../lib/content-source.mjs';
import { writeGeneratedFile } from '../../lib/generated-files.mjs';

const root = resolve(import.meta.dirname, '../../..');
const read = path => readContentSource(resolve(root, path));
const manifest = read('src/game-data/data/manifest.json');
const audit = damagePathAudit(manifest, manifest.characters.map(id => read(`src/game-data/data/characters/${id}.json`)));
const target = resolve(root, 'docs/planning/p5-inventory-characters.md');
const marker = '<!-- p5-damage-path-index -->';
const content = readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
const start = content.indexOf(marker);
const prefix = (start < 0 ? content : content.slice(0, start)).trimEnd();
const updated = `${prefix}\n\n${marker}\n${damagePathMarkdown(audit)}`;
if (process.argv.includes('--write-docs')) writeGeneratedFile(target, updated);
else if (process.argv.includes('--check') && content !== updated) throw new Error('Damage-path inventory is stale; run audit-damage-paths.mjs --write-docs.');
console.log(JSON.stringify(audit.summary));
