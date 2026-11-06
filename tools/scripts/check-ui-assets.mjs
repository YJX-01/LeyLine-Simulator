import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const directory = new URL('../../src/web/src/assets/genshin/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
let totalBytes = 0;
for (const asset of manifest.assets) {
  const content = await readFile(new URL(asset.file, directory));
  if (content.toString('ascii', 0, 4) !== 'RIFF' || content.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid WebP: ${asset.file}`);
  if (content.length !== asset.bytes || content.length > manifest.budgets.maxAssetBytes) throw new Error(`Asset size mismatch or budget exceeded: ${asset.file}`);
  if (createHash('sha256').update(content).digest('hex') !== asset.sha256) throw new Error(`Asset hash mismatch: ${asset.file}`);
  totalBytes += content.length;
}
if (totalBytes !== manifest.totalBytes || totalBytes > manifest.budgets.maxTotalBytes) throw new Error('UI image total exceeds declared budget');
// The original seven decorative assets retain their own small budget. The
// separately loaded content library covers catalog identities, not decoration.
const iconDirectory = new URL('../../src/web/public/game-icons/', import.meta.url);
const icons = JSON.parse(await readFile(new URL('manifest.json', iconDirectory), 'utf8'));
const index = JSON.parse(await readFile(new URL('../../src/web/src/assets/game-icon-index.json', import.meta.url), 'utf8'));
let iconBytes = 0;
const files = new Set();
for (const asset of icons.assets) {
  const content = await readFile(new URL(asset.file, iconDirectory));
  if (asset.sourceSha256 === 'ae5d4d9be2e3ee89c0fc94a326aaefd8412c55d916bef6f7d28c88ebf771af7b' || !(asset.alphaMax >= 128)) throw new Error(`Placeholder or empty icon: ${asset.key}`);
  if (asset.kind === 'characters' && (asset.dimensions[0] !== 128 || asset.dimensions[1] !== 128 || asset.transform !== 'square-portrait-v1')) throw new Error(`Inconsistent portrait dimensions: ${asset.key}`);
  if (index[asset.kind]?.[asset.key]?.revision !== asset.sha256.slice(0, 12)) throw new Error(`Icon cache revision mismatch: ${asset.key}`);
  if (files.has(asset.file)) throw new Error(`Duplicate icon: ${asset.file}`);
  files.add(asset.file);
  if (content.toString('ascii', 0, 4) !== 'RIFF' || content.toString('ascii', 8, 12) !== 'WEBP') throw new Error(`Invalid icon WebP: ${asset.file}`);
  if (content.length !== asset.bytes || content.length > icons.budgets.maxAssetBytes || createHash('sha256').update(content).digest('hex') !== asset.sha256) throw new Error(`Icon integrity or budget failure: ${asset.file}`);
  if (index[asset.kind]?.[asset.key]?.file !== asset.file) throw new Error(`Icon index mismatch: ${asset.key}`);
  iconBytes += content.length;
}
if (iconBytes !== icons.totalBytes || iconBytes > icons.budgets.maxTotalBytes) throw new Error('Offline icon library exceeds declared budget');
const ornamentPaths = ['knot-corner.svg', 'knot-divider.svg'];
let ornamentBytes = 0;
for (const name of ornamentPaths) ornamentBytes += (await readFile(new URL(`../../src/web/src/assets/ornaments/${name}`, import.meta.url))).length;
if (ornamentBytes > 5120) throw new Error('SVG ornament budget exceeded');
console.log(JSON.stringify({ directory: fileURLToPath(directory), images: manifest.assets.length, totalBytes, sourceBytes: manifest.totalSourceBytes,
  reductionPercent: +(100 * (1 - totalBytes / manifest.totalSourceBytes)).toFixed(2), ornamentBytes,
  catalogIcons: icons.assets.length, iconBytes, missingIcons: icons.missing.length,
  iconReductionPercent: +(100 * (1 - iconBytes / icons.totalSourceBytes)).toFixed(2) }, null, 2));
