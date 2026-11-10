import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { missingCharacterIcons, characterIconReferences } from '../../lib/asset-index.mjs';

const iconDirectory = new URL('../../../', import.meta.url);
const icons = JSON.parse(await readFile(new URL('assets/manifest.json', iconDirectory), 'utf8'));
const index = { ...JSON.parse(await readFile(new URL('../../../src/web/generated/game-icon-index.json', import.meta.url), 'utf8')), ...JSON.parse(await readFile(new URL('../../../src/web/generated/game-detail-icon-index.json', import.meta.url), 'utf8')) };
let iconBytes = 0;
const files = new Set();
for (const asset of icons.assets) {
  if (!asset.file.startsWith(`assets/game/${asset.kind==='artifactSlots'?'artifact-slots':asset.kind}/`) || asset.file.includes('..')) throw new Error(`Unclassified icon path: ${asset.file}`);
  const content = await readFile(new URL(asset.file, iconDirectory));
  if (!(asset.alphaMax >= 128)) throw new Error(`Empty icon: ${asset.key}`);
  if (['characters', 'weapons'].includes(asset.kind) && (!Number.isInteger(asset.rarity) || asset.rarity < 1 || asset.rarity > 5 || index[asset.kind]?.[asset.key]?.rarity !== asset.rarity)) throw new Error(`Missing rarity identity: ${asset.key}`);
  if (asset.kind === 'elements' && (asset.dimensions[0] !== 128 || asset.dimensions[1] !== 128 || asset.transform !== 'element-hq-v2')) throw new Error(`Low resolution element: ${asset.key}`);
  if (asset.kind === 'weapons' && (asset.transform !== (asset.weaponType === 'WEAPON_CATALYST' ? 'full-weapon-square-v4' : 'equipment-detail-square-v4') || asset.dimensions[0] !== 128 || asset.dimensions[1] !== 128)) throw new Error(`Invalid weapon framing: ${asset.key}`);
  if (asset.kind === 'artifacts' && (asset.dimensions[0] !== 128 || asset.dimensions[1] !== 128 || asset.transform !== 'artifact-square-v2')) throw new Error(`Inconsistent artifact canvas: ${asset.key}`);
  if (asset.kind === 'artifactSlots' && (asset.format !== 'SVG' || asset.transform !== 'artifact-slot-vector-v1' || !content.toString('utf8').includes('fill="white"'))) throw new Error(`Invalid artifact slot vector: ${asset.key}`);
  if (asset.kind === 'characters' && (asset.dimensions[0] !== 128 || asset.dimensions[1] !== 128 || asset.transform !== (['manekin', 'manekina'].includes(asset.key) ? 'square-transparent-v2' : 'square-portrait-v1'))) throw new Error(`Inconsistent portrait dimensions: ${asset.key}`);
  if (['skills', 'constellations', 'buffs', 'stats'].includes(asset.kind) && (asset.dimensions[0] !== 128 || asset.dimensions[1] !== 128 || asset.transform !== (asset.kind === 'stats' ? 'stat-vector-v4' : asset.kind === 'buffs' ? 'combat-glyph-contain-v2' : 'transparent-contain-hq-v1'))) throw new Error(`Inconsistent detail icon: ${asset.key}`);
  if (index[asset.kind]?.[asset.key]?.revision !== createHash('sha256').update(content).digest('hex').slice(0,12)) throw new Error(`Icon cache revision mismatch: ${asset.key}`);
  if (files.has(asset.file)) throw new Error(`Duplicate icon: ${asset.file}`);
  files.add(asset.file);
  if (asset.format === 'SVG') {
    const svg = content.toString('utf8');
    if (!svg.startsWith('<svg ') || !svg.includes('viewBox="0 0 24 24"') || !svg.includes('<path ') || /<(?:script|image|foreignObject)\b|(?:href|onload)=/i.test(svg)) throw new Error(`Invalid icon SVG: ${asset.file}`);
    if (!content.equals(await readFile(new URL(`../../../${asset.vectorPath}`, import.meta.url)))) throw new Error(`Canonical vector mismatch: ${asset.key}`);
  } else if (content.toString('ascii', 0, 4) !== 'RIFF' || content.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid icon WebP: ${asset.file}`);
  if (content.length !== asset.bytes || content.length > icons.budgets.maxAssetBytes) throw new Error(`Icon size or budget failure: ${asset.file}`);
  if (index[asset.kind]?.[asset.key]?.file !== asset.file) throw new Error(`Icon index mismatch: ${asset.key}`);
  for (const alias of asset.aliases ?? []) if (index[asset.kind]?.[alias.key]?.file !== asset.file) throw new Error(`Shared icon alias mismatch: ${alias.key}`);
  iconBytes += content.length;
}
for (const alias of icons.sharedBuffStatIcons ?? []) if (index.buffs[alias.key]?.file !== index.stats[alias.stat]?.file) throw new Error(`Shared buff/stat icon mismatch: ${alias.key}`);
const normalAttackIcons = icons.assets.filter(asset => asset.kind === 'skills' && asset.slot === 'combat1');
const normalContents = await Promise.all(normalAttackIcons.map(async asset=>createHash('sha256').update(await readFile(new URL(asset.file,iconDirectory))).digest('hex')));
if (new Set(normalContents).size !== normalAttackIcons.length || normalAttackIcons.some(asset => !asset.aliases?.length)) throw new Error('Normal attack images must be shared by aliases');
for (const omitted of icons.excluded ?? []) if (index[omitted.kind]?.[omitted.key]) throw new Error(`Excluded utility passive entered the library: ${omitted.key}`);
if (iconBytes !== icons.totalBytes || iconBytes > icons.budgets.maxTotalBytes) throw new Error('Offline icon library exceeds declared budget');
const ornamentPaths = ['knot-corner.svg', 'close-arrows.svg'];
let ornamentBytes = 0;
for (const name of ornamentPaths) ornamentBytes += (await readFile(new URL(`../../../assets/ui/ornaments/${name}`, import.meta.url))).length;
// The user-approved CC0 vine corner retains its full curve paths (~7 KiB).
if (ornamentBytes > 10240) throw new Error('SVG ornament budget exceeded');
const characterDirectory = new URL('src/game-data/data/characters/',iconDirectory);
const characters = await Promise.all((await readdir(characterDirectory)).filter(file=>file.endsWith('.json')).map(async file=>JSON.parse(await readFile(new URL(file,characterDirectory),'utf8'))));
const missing = missingCharacterIcons(index,characters);
if (missing.length) throw new Error(`Unresolved current character artwork: ${JSON.stringify(missing)}`);
console.log(JSON.stringify({ ornamentBytes,
  catalogIcons: icons.assets.length, iconBytes, characterIconReferences:characterIconReferences(characters).length, missingIcons: missing.length,
  sharedNormalAttackIcons: normalAttackIcons.length, excludedUtilityPassives: icons.excluded?.length ?? 0,
  iconReductionPercent: +(100 * (1 - iconBytes / icons.totalSourceBytes)).toFixed(2) }, null, 2));
