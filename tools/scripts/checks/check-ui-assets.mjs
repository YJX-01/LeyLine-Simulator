import { readAssetCapture } from '../../lib/asset-capture.mjs';
import { currentAssetIndex } from '../../lib/display-data.mjs';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { missingCharacterIcons, characterIconReferences } from '../../lib/asset-index.mjs';

const iconDirectory = new URL('../../../', import.meta.url);
const icons = JSON.parse(await readFile(new URL('assets/manifest.json', iconDirectory), 'utf8'));
if (icons.formatVersion !== 4) throw new Error('Asset manifest formatVersion must be 4');
const capture = readAssetCapture();
const index = currentAssetIndex();
let iconBytes = 0;
const files = new Set();
for (const entry of icons.assets) {
  const sourceInput = capture.inputs.get(entry.file);
  if (!sourceInput) throw new Error('Missing capture input: ' + entry.file);
  const asset = { ...entry, ...sourceInput };
  if (!asset.file.startsWith(`assets/game/${asset.kind==='artifactSlots'?'artifact-slots':asset.kind}/`) || asset.file.includes('..')) throw new Error(`Unclassified icon path: ${asset.file}`);
  const content = await readFile(new URL(asset.file, iconDirectory));
  if (['characters', 'weapons'].includes(asset.kind) && (!Number.isInteger(asset.rarity) || asset.rarity < 1 || asset.rarity > 5 || index[asset.kind]?.[asset.key]?.rarity !== asset.rarity)) throw new Error(`Missing rarity identity: ${asset.key}`);
  if (asset.kind === 'elements' && (asset.transform !== 'element-hq-v2')) throw new Error(`Low resolution element: ${asset.key}`);
  if (asset.kind === 'weapons' && (asset.transform !== (asset.weaponType === 'WEAPON_CATALYST' ? 'full-weapon-square-v4' : 'equipment-detail-square-v4'))) throw new Error(`Invalid weapon framing: ${asset.key}`);
  if (asset.kind === 'artifacts' && (asset.transform !== 'artifact-square-v2')) throw new Error(`Inconsistent artifact canvas: ${asset.key}`);
  if (asset.kind === 'artifactSlots' && (!asset.file.endsWith('.svg') || asset.transform !== 'artifact-slot-vector-v1' || !content.toString('utf8').includes('fill="white"'))) throw new Error(`Invalid artifact slot vector: ${asset.key}`);
  if (asset.kind === 'characters' && (asset.transform !== (['manekin', 'manekina'].includes(asset.key) ? 'square-transparent-v2' : 'square-portrait-v1'))) throw new Error(`Inconsistent portrait dimensions: ${asset.key}`);
  if (['skills', 'constellations', 'buffs', 'stats'].includes(asset.kind) && (asset.transform !== (asset.kind === 'stats' ? 'stat-vector-v6' : asset.kind === 'buffs' ? 'combat-glyph-contain-v2' : 'transparent-contain-hq-v1'))) throw new Error(`Inconsistent detail icon: ${asset.key}`);
  if (index[asset.kind]?.[asset.key]?.revision !== createHash('sha256').update(content).digest('hex').slice(0,12)) throw new Error(`Icon cache revision mismatch: ${asset.key}`);
  if (files.has(asset.file)) throw new Error(`Duplicate icon: ${asset.file}`);
  files.add(asset.file);
  if (asset.file.endsWith('.svg')) {
    const svg = content.toString('utf8');
    if (!svg.startsWith('<svg ') || !svg.includes('viewBox="0 0 24 24"') || !svg.includes('<path ') || /<(?:script|image|foreignObject)\b|(?:href|onload)=/i.test(svg)) throw new Error(`Invalid icon SVG: ${asset.file}`);
    if ('vectorPath' in asset || !asset.sourceFilename) throw new Error(`Incomplete vector source: ${asset.key}`);
    const source = new URL(asset.sourceUrl);
    if (asset.sourceModule) {
      if (source.origin !== 'https://gi.yatta.moe' || source.pathname !== `/js/${asset.sourceVersion}` || !/^app\.[a-f0-9]+\.js$/.test(asset.sourceVersion) || !/^[a-f0-9]{4}$/.test(asset.sourceModule) || !/^prop\/FIGHT_PROP_(ATTACK|HP|DEFENSE)_PERCENT\.svg$/.test(asset.sourceFilename)) throw new Error(`Invalid bundled vector source: ${asset.key}`);
    } else {
      const [owner, repository, commit] = source.pathname.slice(1).split('/');
      if (capture.sourceCommits[`${owner}/${repository}`] !== commit || !asset.sourceUrl.endsWith(`/${asset.sourceFilename}.tsx`)) throw new Error(`Vector source version mismatch: ${asset.key}`);
    }
  } else if (content.toString('ascii', 0, 4) !== 'RIFF' || content.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid icon WebP: ${asset.file}`);
  if (content.length > icons.budgets.maxAssetBytes) throw new Error(`Icon size or budget failure: ${asset.file}`);
  if (index[asset.kind]?.[asset.key]?.file !== asset.file) throw new Error(`Icon index mismatch: ${asset.key}`);
  for (const alias of asset.aliases ?? []) if (index[asset.kind]?.[alias.key]?.file !== asset.file) throw new Error(`Shared icon alias mismatch: ${alias.key}`);
  iconBytes += content.length;
}
for (const alias of icons.sharedBuffStatIcons ?? []) if (index.buffs[alias.key]?.file !== index.stats[alias.stat]?.file) throw new Error(`Shared buff/stat icon mismatch: ${alias.key}`);
const normalAttackIcons = icons.assets.filter(asset => asset.kind === 'skills' && asset.slot === 'combat1');
const normalContents = await Promise.all(normalAttackIcons.map(async asset=>createHash('sha256').update(await readFile(new URL(asset.file,iconDirectory))).digest('hex')));
if (new Set(normalContents).size !== normalAttackIcons.length || normalAttackIcons.some(asset => !asset.aliases?.length)) throw new Error('Normal attack images must be shared by aliases');
for (const omitted of capture.excluded ?? []) if (index[omitted.kind]?.[omitted.key]) throw new Error(`Excluded utility passive entered the library: ${omitted.key}`);
if (iconBytes > icons.budgets.maxTotalBytes) throw new Error('Offline icon library exceeds declared budget');
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
  sharedNormalAttackIcons: normalAttackIcons.length, excludedUtilityPassives: capture.excluded?.length ?? 0 }, null, 2));
