import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const errors = [];
function walk(directory) {
  return readdirSync(resolve(root,directory),{withFileTypes:true}).flatMap(entry => entry.isDirectory()?walk(`${directory}/${entry.name}`):[`${directory}/${entry.name}`]);
}
const files = ['README.md','AGENTS.md','tools/README.md','assets/README.md',...walk('docs'),...['schema','game-data','engine','web'].map(name=>`src/${name}/README.md`)];
const slug = value => value.toLowerCase().replace(/[`*_]/g,'').replace(/[^\p{L}\p{N}\s_-]/gu,'').replace(/\s/g,'-');
for (const file of files) {
  if (!file.endsWith('.md')) {errors.push(`${file}: docs accepts Markdown only`);continue;}
  const content=readFileSync(resolve(root,file),'utf8');
  for(const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^(?:[a-z]+:|#)/i.test(match[1])) continue;
    const [path,anchor]=match[1].split('#'),target=resolve(root,dirname(file),decodeURI(path));
    if(!existsSync(target)){errors.push(`${file}: missing link ${match[1]}`);continue;}
    if(anchor && statSync(target).isFile() && target.endsWith('.md')) {
      const headings=[...readFileSync(target,'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)].map(item=>slug(item[1]));
      if(!headings.includes(decodeURI(anchor)))errors.push(`${file}: missing heading ${match[1]}`);
    }
  }
}
const scripts=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).scripts;
for(const [name,command] of Object.entries(scripts))for(const match of command.matchAll(/\b(?:node|python)\s+(?:--[\w-]+\s+)*([^\s&]+)/g)) {
  if(!match[1].includes('*') && (!existsSync(resolve(root,match[1])) || !statSync(resolve(root,match[1])).isFile()))errors.push(`${name}: missing command ${match[1]}`);
  if(match[1].startsWith('archive/'))errors.push(`${name}: default command reads archive`);
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log(`Validated ${files.length} current Markdown files and ${Object.keys(scripts).length} commands.`);
