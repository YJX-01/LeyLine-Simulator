import { sourceFingerprint } from '../../lib/source-fingerprint.mjs';
import { assertBuildOutput, publishRelease, removeBuildOutput, withBuildWorkspace, writeOutputAtomic } from '../../lib/build-outputs.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { packager } from '@electron/packager';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const fingerprint = sourceFingerprint();
const version = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
const require = createRequire(resolve(root, 'src/web/package.json'));
const vite = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');

await withBuildWorkspace(root, 'desktop', async workspace => {
  const stage = resolve(workspace, 'app'), outputDirectory = resolve(workspace, 'output');
  await mkdir(stage);
  await cp(resolve(root, 'src/web/desktop'), resolve(stage, 'desktop'), { recursive: true });
  await cp(resolve(root, 'src/web/server'), resolve(stage, 'server'), { recursive: true });
  await writeFile(resolve(stage, 'package.json'), JSON.stringify({ name: 'leyline-desktop', productName: 'LeyLine', version, type: 'module', main: 'desktop/main.mjs' }, null, 2) + '\n');
  // Build into the temporary app directly; do not keep a second dist-desktop copy.
  execFileSync(process.execPath, [vite, 'build', '--base=./', `--outDir=${resolve(stage, 'renderer')}`, '--emptyOutDir'], { cwd: resolve(root, 'src/web'), stdio: 'inherit', windowsHide: true });
  const electronVersion = JSON.parse(await readFile(resolve(root, 'node_modules/electron/package.json'), 'utf8')).version;
  const output = await packager({ dir: stage, out: outputDirectory, name: 'LeyLine', platform: process.platform, arch: process.arch,
    electronVersion, overwrite: false, asar: true, prune: false,
    ...(process.env.LEYLINE_ELECTRON_ZIP_DIR ? { electronZipDir: resolve(process.env.LEYLINE_ELECTRON_ZIP_DIR) } : {}),
    appCopyright: 'LeyLine contributors', executableName: 'LeyLine' });
  for (const directory of output) for (const name of ['LICENSE', 'LICENSES.chromium.html']) {
    const original = await readFile(resolve(root, 'node_modules/electron/dist', name));
    const bundled = await readFile(resolve(directory, name));
    if (createHash('sha256').update(original).digest('hex') !== createHash('sha256').update(bundled).digest('hex')) throw new Error(`Desktop notice mismatch: ${name}`);
  }
  const appPath = relative(outputDirectory, output[0]);
  const executableName = process.platform === 'win32' ? 'LeyLine.exe' : 'LeyLine';
  const executable = process.platform === 'darwin' ? resolve(output[0], 'LeyLine.app/Contents/MacOS/LeyLine') : resolve(output[0], executableName);
  const asar = process.platform === 'darwin' ? resolve(output[0], 'LeyLine.app/Contents/Resources/app.asar') : resolve(output[0], 'resources/app.asar');
  if (!(await stat(executable)).isFile() || !(await stat(asar)).size) throw new Error('Desktop application is incomplete.');
  if (sourceFingerprint() !== fingerprint) throw new Error('Source changed during packaging; rebuild the desktop package.');
  await mkdir(assertBuildOutput(root, 'artifacts/desktop'), { recursive: true });
  if (process.platform === 'win32') {
    // The stable launcher reads the pointer, so publishing changes only one authoritative JSON file.
    const launcher = "@echo off\r\nsetlocal\r\nset \"ELECTRON_RUN_AS_NODE=\"\r\nset \"LEYLINE_DESKTOP_HOME=%~dp0\"\r\npowershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -Command \"$homePath=$env:LEYLINE_DESKTOP_HOME; $repoRoot=[IO.Path]::GetFullPath((Join-Path $homePath '..\\..')); $release=Get-Content -LiteralPath (Join-Path $homePath 'latest.json') -Raw | ConvertFrom-Json; Start-Process -FilePath (Join-Path $repoRoot $release.executable)\"\r\n";
    writeOutputAtomic(root, 'artifacts/desktop/Start-LeyLine.cmd', launcher);
  }
  const published = await publishRelease(root, 'desktop', outputDirectory, directory => ({ formatVersion: 1, version, sourceFingerprint: fingerprint,
    directory: relative(root, resolve(directory, appPath)), executable: relative(root, resolve(directory, relative(outputDirectory, executable))) }));
  if (existsSync(resolve(root, 'src/web/dist-desktop'))) removeBuildOutput(root, 'src/web/dist-desktop');
  console.log(JSON.stringify({ output: resolve(published.directory, appPath), version, retainedReleases: published.retained }, null, 2));
});
