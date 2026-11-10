import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const portable = path => relative(root, path).replaceAll('\\', '/');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const allowed = {
  '@leyline/schema': [],
  '@leyline/game-data': ['@leyline/schema'],
  '@leyline/engine': ['@leyline/schema'],
  '@leyline/web': ['@leyline/schema', '@leyline/game-data', '@leyline/engine'],
};
// Match pnpm-workspace.yaml's src/* discovery. New workspaces
// must declare a dependency policy here before their source can pass CI.
const workspaces = ['src'].flatMap(parent => readdirSync(resolve(root, parent), { withFileTypes: true })
  .filter(entry => entry.isDirectory() && existsSync(resolve(root, parent, entry.name, 'package.json')))
  .map(entry => ({ directory: `${parent}/${entry.name}`, ...read(`${parent}/${entry.name}/package.json`) })));
const owner = path => workspaces.find(workspace => path.startsWith(`${workspace.directory}/`));
const exportsOf = workspace => typeof workspace.exports === 'string' ? { '.': workspace.exports } : workspace.exports ?? {};
const errors = [];
const graph = new Map();
const fail = (path, message) => errors.push(`${path}: ${message}`);
function checkDocuments(directory = 'docs') {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) checkDocuments(path);
    else if (!path.endsWith('.md')) fail(path, 'docs contains documentation only; move metadata, sources and raw evidence to their owning data/assets directory or authorized .references source');
  }
}
checkDocuments();
for (const path of ['apps', 'packages', 'scripts', 'patches', 'fixtures', 'tests/fixtures', 'tools/desktop', 'src/web/public', '.patch-work', '.pnpm-store']) {
  if (existsSync(resolve(root, path))) fail(path, 'retired root directory; use src/, tools/, or .cache/ instead');
}
for (const workspace of workspaces) {
  if (!Object.hasOwn(allowed, workspace.name)) fail(workspace.directory, `define an architecture dependency policy for ${workspace.name}`);
}

function walk(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap(entry => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory() ? walk(path) : /\.(ts|vue|mjs|cjs)$/.test(path) && !path.endsWith('.d.ts') ? [path] : [];
  });
}

function localTarget(from, specifier) {
  const base = resolve(root, dirname(from), specifier);
  const path = [base, `${base}.ts`, `${base}.vue`, `${base}.mjs`, `${base}.json`, resolve(base, 'index.ts')]
    .find(candidate => existsSync(candidate) && statSync(candidate).isFile());
  return path && portable(path);
}

function checkImport(from, specifier, runtime) {
  const source = owner(from);
  const test = /\.(test|spec)\.ts$/.test(from);
  let target;
  if (specifier.startsWith('.')) {
    target = localTarget(from, specifier);
    if (!target) return fail(from, `unresolved local module ${specifier}`);
    if (target.startsWith('archive/')) fail(from, `active code cannot import archived implementation: ${specifier}`);
    const destination = owner(target);
    if (source && destination && source !== destination) fail(from, `use ${destination.name}'s public exports instead of a relative cross-workspace import`);
    if (source && source.name !== '@leyline/web' && !test && !target.startsWith(`${source.directory}/src/`) && !(source.name === '@leyline/game-data' && target.startsWith(`${source.directory}/generated/`) && target.endsWith('.json'))) {
      fail(from, `shared production code cannot import repository adapters or fixtures: ${specifier}`);
    }
    const generatedJson = target.startsWith('src/web/generated/') && target.endsWith('.json');
    if (!test && from.startsWith('src/web/src/domain/') && target.startsWith('src/web/src/') && !target.startsWith('src/web/src/domain/') && !generatedJson) {
      fail(from, `domain modules cannot depend on UI, state, or lifecycle modules: ${specifier}`);
    }
  } else {
    const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0];
    const destination = workspaces.find(workspace => workspace.name === name);
    if (destination) {
      const entry = specifier === name ? '.' : `.${specifier.slice(name.length)}`;
      const exported = exportsOf(destination)[entry];
      if (typeof exported !== 'string') fail(from, `private workspace path ${specifier}; use a declared package export`);
      else target = portable(resolve(root, destination.directory, exported));
      if (source && source !== destination && !allowed[source.name]?.includes(name)) fail(from, `${source.name} cannot depend on ${name}`);
    }
    if (source && name !== source.name) {
      const declared = { ...source.dependencies, ...source.peerDependencies, ...(test || from.startsWith('src/web/desktop/') ? source.devDependencies : {}) };
      // Vitest is intentionally owned by the root workspace.
      if (!isBuiltin(specifier) && !(test && name === 'vitest') && !declared[name]) fail(from, `undeclared dependency ${name} in ${source.directory}/package.json`);
    }
    if (!test && source && source.name !== '@leyline/web' && (isBuiltin(specifier) || ['vue', 'pinia', 'echarts'].includes(name))) {
      fail(from, `shared packages cannot depend on platform or UI adapters: ${specifier}`);
    }
    if (!test && from.startsWith('src/web/src/domain/') && ['vue', 'pinia'].includes(name)) fail(from, `domain modules cannot import ${name}`);
  }
  if (runtime && target && !test && !/\.(test|spec)\.ts$/.test(target)) graph.get(from)?.add(target);
}

const files = [...workspaces.flatMap(workspace => walk(`${workspace.directory}/src`)), ...walk('tools/scripts'), ...walk('tools/lib'), ...walk('src/web/desktop'), ...walk('src/web/server'), ...walk('tests')];
for (const path of files) graph.set(path, new Set());
for (const path of files) {
  const content = readFileSync(resolve(root, path), 'utf8');
  if(path.startsWith('src/') && /\.(test|spec)\./.test(path))fail(path,'all tests belong under tests/');
  if(path.startsWith('src/') && /\b(?:evaluateP3|P3Read|P3EffectInstance|simulateTeam|simulateCombat|workbench-p3|workbench-v1)\b/.test(content))fail(path,'retired API or phase name in active source');
  const source = path.endsWith('.vue')
    ? [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n')
    : content;
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      let runtime = !node.isTypeOnly && !node.importClause?.isTypeOnly;
      const bindings = node.importClause?.namedBindings ?? node.exportClause;
      if (bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))) {
        if (bindings.elements.length && bindings.elements.every(element => element.isTypeOnly) && !node.importClause?.name) runtime = false;
      }
      checkImport(path, node.moduleSpecifier.text, runtime);
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) checkImport(path, argument.text, true);
      // Tooling resolves Vite from its owning workspace without hoisting it to the root.
      else if (['tools/scripts/data/evaluate-project.mjs', 'tests/performance/timeline.mjs', 'tools/lib/load-content-schema.mjs'].includes(path) && argument?.getText(ast) === "pathToFileURL(require.resolve('vite')).href") {
        checkImport(path, 'vite', true);
      } else fail(path, 'computed module imports require an explicit architecture-check rule');
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL' && node.arguments?.length === 2) {
      const [argument, base] = node.arguments;
      if (ts.isStringLiteralLike(argument) && base.getText(ast) === 'import.meta.url' && /\.(ts|vue|mjs)$/.test(argument.text)) checkImport(path, argument.text, true);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}

const visited = new Set(), active = new Set(), stack = [];
function visitGraph(path) {
  if (active.has(path)) return fail(path, `runtime import cycle: ${[...stack.slice(stack.indexOf(path)), path].join(' -> ')}`);
  if (visited.has(path)) return;
  visited.add(path); active.add(path); stack.push(path);
  for (const target of graph.get(path) ?? []) visitGraph(target);
  stack.pop(); active.delete(path);
}
for (const path of graph.keys()) visitGraph(path);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else console.log(`Architecture checks passed (${files.length} files, ${workspaces.length} workspaces).`);
