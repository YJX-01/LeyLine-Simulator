import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
await mkdir(resolve(root, 'artifacts/desktop-stage'), { recursive: true });
const stage = await mkdtemp(resolve(root, 'artifacts/desktop-stage/build-'));
await cp(resolve(root, 'tools/desktop'), stage, { recursive: true });
await cp(resolve(root, 'src/web/dist-desktop'), resolve(stage, 'renderer'), { recursive: true, force: true });
const version = '0.2.0';
await writeFile(resolve(stage, 'package.json'), JSON.stringify({ name: 'leyline-desktop', productName: 'LeyLine', version, type: 'module', main: 'main.mjs' }, null, 2));
const electronVersion = JSON.parse(await readFile(resolve(root, 'node_modules/electron/package.json'), 'utf8')).version;
const preview = process.argv.includes('--preview');
await mkdir(resolve(root, 'artifacts/desktop/releases'), { recursive: true });
const outputDirectory = preview ? resolve(root, 'artifacts/desktop-preview') : await mkdtemp(resolve(root, 'artifacts/desktop/releases/build-'));
const output = await packager({ dir: stage, out: outputDirectory, name: 'LeyLine',
  platform: process.platform, arch: process.arch, electronVersion, overwrite: preview, asar: true, prune: false,
  appCopyright: 'LeyLine contributors', executableName: 'LeyLine',
});
if (!preview) {
  const executable = resolve(output[0], process.platform === 'win32' ? 'LeyLine.exe' : 'LeyLine');
  const release = { formatVersion: 1, version, directory: relative(root, output[0]), executable: relative(root, executable) };
  await writeFile(resolve(root, 'artifacts/desktop/latest.json'), JSON.stringify(release, null, 2));
  if (process.platform === 'win32') {
    const target = relative(resolve(root, 'artifacts/desktop'), executable);
    await writeFile(resolve(root, 'artifacts/desktop/Start-LeyLine.cmd'), `@echo off\r\nset "ELECTRON_RUN_AS_NODE="\r\nstart "" "%~dp0${target}"\r\n`);
  }
}
console.log(JSON.stringify({ output, version }, null, 2));
