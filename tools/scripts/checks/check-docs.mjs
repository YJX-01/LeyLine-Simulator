import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const errors = [];
for (const directory of ['src/schema', 'src/web', 'tools', 'tools/data']) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') errors.push(`${directory}/${entry.name}: consolidate maintained notes into the directory README`);
  }
}
const read = file => readFileSync(resolve(root, file), 'utf8');
function walk(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true })
    .flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}

const documents = walk('docs');
const packages = ['schema', 'game-data', 'engine', 'web'];
const files = [...new Set([
  'README.md', 'AGENTS.md', 'assets/README.md', 'tests/README.md', 'tests/performance/README.md',
  ...documents,
  ...walk('tools').filter(file => file.endsWith('.md') && !file.startsWith('tools/data/sources/')),
  ...packages.flatMap(name => readdirSync(resolve(root, 'src', name), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.md')).map(entry => `src/${name}/${entry.name}`)),
])];
const slug = value => value.toLowerCase().replace(/[`*_]/g, '').replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-');
const headings = content => [...content.matchAll(/^#{1,6}\s+(.+)$/gm)].map(match => slug(match[1]));
const concreteNames = new Set(['characters', 'weapons', 'artifact-sets'].flatMap(directory =>
  readdirSync(resolve(root, 'src/game-data/data', directory)).filter(file => file.endsWith('.json')).map(file => {
    const entity = JSON.parse(read(`src/game-data/data/${directory}/${file}`));
    return entity.identity?.name ?? entity.name;
  }).filter(name => typeof name === 'string' && name.length > 1)));
const wording = ['不代表', '不等于', '不意味着', '不能据此', '不声称', '不宣称', '不得', '禁止', '不允许', '不自动', '不擅自', '本轮', '免责'];
for (const file of files) {
  if (!file.endsWith('.md')) {
    errors.push(`${file}: docs accepts Markdown only`);
    continue;
  }
  const content = read(file);
  if (file.startsWith('docs/')) {
    if (file.slice(5).includes('/')) errors.push(`${file}: keep topic documents directly in docs`);
    if (content.startsWith('\uFEFF') || content.includes('\r') || !content.endsWith('\n') || content.endsWith('\n\n')) {
      errors.push(`${file}: use UTF-8 without BOM, LF and one final newline`);
    }
    if (/(?:\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b|20\d{2}年\d{1,2}月|\b20\d{6}\b)/.test(content)) {
      errors.push(`${file}: move dated records to source or audit notes`);
    }
    if (/\b(?:[a-f\d]{40}|[a-f\d]{64}|\d{9,16})\b/i.test(content)) {
      errors.push(`${file}: move concrete identities and fingerprints to their owning records`);
    }
    for (const phrase of wording) if (content.includes(phrase)) errors.push(`${file}: state the rule directly instead of "${phrase}"`);
    for (const name of concreteNames) if (content.includes(name)) errors.push(`${file}: move entity-specific material "${name}" to content notes`);
  }
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^[a-z]+:/i.test(match[1])) continue;
    const [path, anchor] = match[1].split('#');
    const target = path ? resolve(root, dirname(file), decodeURI(path)) : resolve(root, file);
    if (!existsSync(target)) {
      errors.push(`${file}: missing link ${match[1]}`);
      continue;
    }
    if (anchor && statSync(target).isFile() && target.endsWith('.md') && !headings(readFileSync(target, 'utf8')).includes(decodeURI(anchor))) {
      errors.push(`${file}: missing heading ${match[1]}`);
    }
  }
}
const references = JSON.parse(read('tools/data/references.json'));
for (const reference of references.repositories) {
  if (reference.research && !existsSync(resolve(root, reference.research))) errors.push(`${reference.id}: missing research ${reference.research}`);
}
const scripts = JSON.parse(read('package.json')).scripts;
for (const [name, command] of Object.entries(scripts)) {
  for (const match of command.matchAll(/\b(?:node|python)\s+(?:--[\w-]+\s+)*([^\s&]+)/g)) {
    if (!match[1].includes('*') && (!existsSync(resolve(root, match[1])) || !statSync(resolve(root, match[1])).isFile())) {
      errors.push(`${name}: missing command ${match[1]}`);
    }
    if (match[1].startsWith('archive/')) errors.push(`${name}: default command reads archive`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Validated ${documents.length} topic documents, ${files.length} maintained Markdown files and ${Object.keys(scripts).length} commands.`);
}
