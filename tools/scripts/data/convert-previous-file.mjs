import { linkSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { readContentSource } from '../../lib/content-source.mjs';
import { convertPreviousDocument } from '../../lib/previous-content.mjs';
import { APP_VERSION } from '../../../src/schema/src/version.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';

const [source, destination, ...rest] = process.argv.slice(2);
if (!source || !destination || rest.length || resolve(source) === resolve(destination)) throw new Error('用法：convert-previous-file <旧文件.json> <新副本.json>');
const { value, warnings } = convertPreviousDocument(readContentSource(source), APP_VERSION);
const schema = await loadContentSchema();
if (value.kind === 'character-definition') schema.characterMetadataSchema.parse(value);
else if (value.kind === 'definition-library') schema.definitionLibrarySchema.parse(value);
else {
  // Version 0.1 stored standard curves by identifier. Only use its frozen common table.
  const prior = readContentSource(new URL('../../data/sources/catalog/genshin-db/character-curves.json', import.meta.url));
  for (const character of Object.values(value.content.characters)) for (const key of Object.values(character.progression.curveIds)) {
    if (character.curves?.[key] || value.content.curves[key]) continue;
    const levels = Object.keys(prior).map(Number).filter(Number.isInteger).sort((a, b) => a - b);
    const curve = Array.from({ length: levels.at(-1) + 1 }, (_, i) => i ? prior[i]?.[key] : 0);
    if (curve.length < 91 || curve.some(v => !Number.isFinite(v))) throw new Error('旧版公共表缺少成长曲线 ' + key);
    value.content.curves[key] = curve;
  }
  const { unpackDocument } = await loadContentSchema('/src/web/src/domain/content-document.ts');
  const document = unpackDocument(value.kind, value);
  const validator = { 'damage-calculator': schema.damageCalculatorSchema, account: schema.accountSchema, axis: schema.projectSchema }[value.kind];
  validator?.parse(document);
}
const temporary = resolve(destination) + '.' + randomUUID() + '.tmp';
writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
try { linkSync(temporary, resolve(destination)); } finally { unlinkSync(temporary); }
console.log(JSON.stringify({ destination, warnings }, null, 2));
