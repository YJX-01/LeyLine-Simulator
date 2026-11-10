import { readFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { createAssetIndex, missingCharacterIcons, characterIconReferences } from '../../lib/asset-index.mjs';
import { writeGeneratedFile, pruneGeneratedFiles } from '../../lib/generated-files.mjs';

const check=process.argv.includes('--check');
const root = resolve(import.meta.dirname, '../../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'assets/manifest.json'), 'utf8'));
const publicRoot = resolve(root, '.cache/public');
const revisions = {};
const copies = new Map();
for (const asset of manifest.assets) {
  const source = resolve(root, asset.file);
  if (!source.startsWith(resolve(root, 'assets') + '/'.replace('/', process.platform === 'win32' ? '\\' : '/'))) throw new Error(`Asset path outside assets: ${asset.file}`);
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
    else { const target = resolve(publicRoot, 'assets', relative(resolve(root,'assets'),source)); copies.set(target, readFileSync(source)); }
  }
}
copyDirectory(resolve(root,'assets/ui'));
pruneGeneratedFiles(root, resolve(publicRoot, 'assets'), [...copies.keys()].map(path=>relative(resolve(publicRoot, 'assets'), path)), check);
if(!check) for (const [target, bytes] of copies) writeGeneratedFile(target, bytes);
const directory = resolve(root,'src/web/generated'); if(!check)mkdirSync(directory,{recursive:true});
for (const [name,groups] of [['game-icon-index',['characters','weapons','artifacts','artifactSlots','elements','stats']],['game-detail-icon-index',['skills','constellations','buffs']]]) {
  const path=resolve(directory,`${name}.json`),text=JSON.stringify(Object.fromEntries(groups.map(kind=>[kind,index[kind]])))+'\n';
  if(check){if(readFileSync(path,'utf8')!==text)throw new Error(`${name}: asset index needs regeneration`);}else writeGeneratedFile(path,text);
}
console.log(`Prepared ${manifest.assets.length} assets from the single resource manifest.`);
console.log(`Resolved ${characterIconReferences(characters).length} current character icon references; no missing artwork.`);
