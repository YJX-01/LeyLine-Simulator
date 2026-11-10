import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, sep } from 'node:path';
const directory = process.argv.find(arg => arg.startsWith('--dir='))?.slice(6);
if (!directory) throw new Error('Usage: pnpm release:verify --dir=artifacts/releases/<candidate>');
const root = resolve(directory), site = resolve(root, 'site');
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
if (manifest.formatVersion !== 1 || !Array.isArray(manifest.files)) throw new Error('Unknown release manifest.');
const actual = (await readdir(site, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => resolve(entry.parentPath, entry.name));
const expected = new Set();
for (const file of manifest.files) {
  const target = resolve(site, file.path);
  if (!target.startsWith(site + sep) || expected.has(target)) throw new Error('Invalid manifest file path.');
  expected.add(target);
  const buffer = await readFile(target);
  if (buffer.length !== file.bytes || createHash('sha256').update(buffer).digest('hex') !== file.sha256) throw new Error(`Checksum mismatch: ${file.path}`);
}
if (actual.length !== expected.size || actual.some(path => !expected.has(path))) throw new Error('Unlisted release files detected.');
console.log(`Verified ${expected.size} site files for ${manifest.commit}.`);
