import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function thirdPartyBundle() {
  const packageCache = new Map();
  function packageFor(id) {
    if (!id.includes('node_modules') || id.startsWith('\0')) return null;
    let directory = dirname(resolve(id.split('?')[0]));
    while (directory.startsWith(root)) {
      if (packageCache.has(directory)) return packageCache.get(directory);
      const path = resolve(directory, 'package.json');
      if (existsSync(path)) {
        const pkg = JSON.parse(readFileSync(path, 'utf8'));
        if (pkg.name && pkg.version) { const result = { name:pkg.name, version:pkg.version, license:pkg.license ?? 'UNDECLARED' }; packageCache.set(directory, result); return result; }
      }
      directory = dirname(directory);
    }
    return null;
  }
  return {
    name:'leyline-third-party-notices',
    configResolved() { execFileSync(process.execPath, [resolve(root, 'tools/scripts/third-party-notices.mjs')], { cwd:root, stdio:'pipe', windowsHide:true }); },
    generateBundle(_options, bundle) {
      const packages = new Map();
      for (const chunk of Object.values(bundle)) if (chunk.type === 'chunk') for (const [id, module] of Object.entries(chunk.modules)) {
        if (module.renderedLength === 0) continue;
        const pkg = packageFor(id);
        if (!pkg) continue;
        const key = `${pkg.name}@${pkg.version}`;
        const result = packages.get(key) ?? { ...pkg, modules:0 };
        result.modules++;
        packages.set(key, result);
      }
      for (const name of ['pinia', 'zod', '@vue/runtime-dom']) if (![...packages.values()].some(pkg => pkg.name === name)) throw new Error(`Bundled license scan missed ${name}`);
      const inventory = JSON.parse(readFileSync(resolve(root, 'licenses/dependencies.json'), 'utf8'));
      for (const key of packages.keys()) if (!inventory.packages.some(pkg => pkg.id === key)) throw new Error(`Bundled package is missing from license inventory: ${key}`);
      this.emitFile({ type:'asset', fileName:'licenses/bundled-packages.json', source:JSON.stringify({ formatVersion:1, packages:[...packages.values()].sort((a,b) => a.name.localeCompare(b.name, 'en')) }, null, 2) + '\n' });
    },
  };
}
