import { sourceFingerprint } from './source-fingerprint.mjs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export async function desktopExecutable(requireCurrent = false) {
  const latest = resolve(root, 'artifacts/desktop/latest.json');
  if (!existsSync(latest)) throw new Error('Desktop build missing. Run pnpm desktop:build first.');
  const manifest = JSON.parse(await readFile(latest, 'utf8'));
  if (manifest.formatVersion !== 1 || typeof manifest.executable !== 'string') throw new Error('Invalid desktop release manifest');
  if (requireCurrent && manifest.sourceFingerprint !== sourceFingerprint()) throw new Error('Desktop package is stale; run pnpm desktop:build before acceptance.');
  const executable = resolve(root, manifest.executable);
  const releaseRoot = resolve(root, 'artifacts/desktop/releases') + sep;
  if (!executable.startsWith(releaseRoot) || !existsSync(executable)) throw new Error('Desktop release is missing or outside the release directory');
  return executable;
}
