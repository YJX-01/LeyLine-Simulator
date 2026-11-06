import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
await mkdir(resolve(root, 'artifacts/desktop-stage'), { recursive: true });
const stage = await mkdtemp(resolve(root, 'artifacts/desktop-stage/build-'));
await cp(resolve(root, 'tools/desktop'), stage, { recursive: true });
await cp(resolve(root, 'src/web/dist-desktop'), resolve(stage, 'renderer'), { recursive: true, force: true });
await writeFile(resolve(stage, 'package.json'), JSON.stringify({ name: 'leyline-desktop', productName: 'LeyLine', version: '0.1.0', type: 'module', main: 'main.mjs' }, null, 2));
const electronVersion = JSON.parse(await readFile(resolve(root, 'node_modules/electron/package.json'), 'utf8')).version;
const output = await packager({ dir: stage, out: resolve(root, 'artifacts/desktop'), name: 'LeyLine',
  platform: process.platform, arch: process.arch, electronVersion, overwrite: true, asar: true, prune: false,
  appCopyright: 'LeyLine contributors', executableName: 'LeyLine',
});
console.log(JSON.stringify({ output }, null, 2));
