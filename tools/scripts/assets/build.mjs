import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { createAssetIndex, missingCharacterIcons, characterIconReferences } from '../../lib/asset-index.mjs';
import { syncGeneratedFile, pruneGeneratedFiles } from '../../lib/generated-files.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--check')) throw new Error('Usage: pnpm data:build [--check]');
const check = args.includes('--check');
const root = resolve(import.meta.dirname, '../../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'assets/manifest.json'), 'utf8'));
if (manifest.formatVersion !== 4) throw new Error('Asset manifest formatVersion must be 4');
const publicRoot = resolve(root, '.cache/public');
const assetRoot = resolve(root, 'assets');
const revisions = {};
const copies = new Map();
for (const asset of manifest.assets) {
  const source = resolve(root, asset.file);
  if (!source.startsWith(assetRoot + sep)) throw new Error(`Asset path outside assets: ${asset.file}`);
  const bytes = readFileSync(source);
  revisions[asset.file] = createHash('sha256').update(bytes).digest('hex').slice(0,12);
  const target = resolve(publicRoot, asset.file);
  copies.set(target, bytes);
}
const characters = readdirSync(resolve(root,'src/game-data/data/characters')).filter(file=>file.endsWith('.json')).sort()
  .map(file=>JSON.parse(readFileSync(resolve(root,'src/game-data/data/characters',file),'utf8')));
const index = createAssetIndex(manifest,characters,revisions);
const missing = missingCharacterIcons(index,characters);
if (missing.length) throw new Error(`Unresolved current character artwork: ${JSON.stringify(missing)}`);
function copyDirectory(path) {
  for (const item of readdirSync(path, {withFileTypes:true})) {
    const source = resolve(path,item.name);
    if (item.isDirectory()) copyDirectory(source);
    else copies.set(resolve(publicRoot, 'assets', relative(assetRoot, source)), readFileSync(source));
  }
}
copyDirectory(resolve(root,'assets/ui'));
pruneGeneratedFiles(root, resolve(publicRoot, 'assets'), [...copies.keys()].map(path=>relative(resolve(publicRoot, 'assets'), path)), check);
for (const [target, bytes] of copies) syncGeneratedFile(target, bytes, check);
console.log(`${check ? 'Validated' : 'Prepared'} ${manifest.assets.length} assets from the resource manifest.`);
console.log(`Resolved ${characterIconReferences(characters).length} current character icon references; no missing artwork.`);
