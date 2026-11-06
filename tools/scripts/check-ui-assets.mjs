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
const ornamentPaths = ['knot-corner.svg', 'knot-divider.svg'];
let ornamentBytes = 0;
for (const name of ornamentPaths) ornamentBytes += (await readFile(new URL(`../../src/web/src/assets/ornaments/${name}`, import.meta.url))).length;
if (ornamentBytes > 5120) throw new Error('SVG ornament budget exceeded');
console.log(JSON.stringify({ directory: fileURLToPath(directory), images: manifest.assets.length, totalBytes, sourceBytes: manifest.totalSourceBytes,
  reductionPercent: +(100 * (1 - totalBytes / manifest.totalSourceBytes)).toFixed(2), ornamentBytes }, null, 2));
