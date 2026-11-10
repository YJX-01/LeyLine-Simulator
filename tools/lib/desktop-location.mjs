import { sourceFingerprint } from './source-fingerprint.mjs';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
export async function desktopExecutable(preview = false, requireCurrent = false) {
  const latest = resolve(root, 'artifacts/desktop/latest.json');
  if(requireCurrent){
    const info=JSON.parse(await readFile(preview?resolve(root,'artifacts/desktop-preview/build-info.json'):latest,'utf8'));
    if(info.sourceFingerprint!==sourceFingerprint())throw new Error('Desktop package is stale; run pnpm desktop:build before acceptance.');
  }
  if (!preview && existsSync(latest)) {
    const manifest = JSON.parse(await readFile(latest, 'utf8'));
    if (manifest.formatVersion !== 1 || typeof manifest.executable !== 'string') throw new Error('Invalid desktop release manifest');
    const executable = resolve(root, manifest.executable);
    const releaseRoot = resolve(root, 'artifacts/desktop/releases') + sep;
    if (!executable.startsWith(releaseRoot) || !existsSync(executable)) throw new Error('Desktop release is missing or outside the release directory');
    return executable;
  }
  const directory = preview ? 'artifacts/desktop-preview' : 'artifacts/desktop';
  return resolve(root, `${directory}/LeyLine-${process.platform}-${process.arch}/${process.platform === 'win32' ? 'LeyLine.exe' : 'LeyLine'}`);
}
