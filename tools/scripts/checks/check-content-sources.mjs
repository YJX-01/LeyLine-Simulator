import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';
import { numericAudit, assertNumericAudit } from '../../lib/numeric-audit.mjs';

const root = resolve(import.meta.dirname, '../../..');
function walk(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}
let sources = 0;
for (const directory of ['src/game-data/data', 'assets/sources', 'tools/data']) {
  const files = walk(directory);
  if (files.some(path => /\.(yaml|yml|jsonc|json5)$/.test(path))) throw new Error(`${directory}: maintained content uses strict JSON`);
  for (const path of files.filter(path => path.endsWith('.json'))) {
    readContentSource(resolve(root, path)); sources++;
  }
}
const audit = numericAudit();
assertNumericAudit(audit);
const documents = walk('docs');
if (documents.some(path => !path.endsWith('.md'))) throw new Error('docs must contain documentation only');
console.log(`Validated ${sources} content sources, ${documents.length} documentation files.`);
console.log(`Compared ${Object.values(audit.comparedValues).reduce((total,count)=>total+count,0)} numeric fields against adopted source values.`);
