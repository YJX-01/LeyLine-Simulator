import { readFileSync,writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root=new URL('../../',import.meta.url),reference=new URL('.references/genshin-db/',root);
const commit='8e5badd60b5d894284ccc927a56c9683529d2592';
if(execFileSync('git',['rev-parse','HEAD'],{cwd:reference,encoding:'utf8'}).trim()!==commit)throw new Error('Use the pinned genshin-db reference.');
const hashes={},forms=[];
for(const element of ['anemo','geo','electro','dendro','hydro','pyro','cryo']){
  const path=`src/data/ChineseSimplified/talents/traveler${element}.json`;
  const text=readFileSync(new URL(path,reference),'utf8').replace(/\r\n/g,'\n'),talents=JSON.parse(text);
  hashes[path]=createHash('sha256').update(text).digest('hex');
  forms.push({element,talentName:talents.name,skills:['combat1','combat2','combat3'].map(key=>({key,name:talents[key].name})),sourcePath:path});
}
const output={source:{repository:'theBowja/genshin-db',commit,hashFormat:'sha256-lf-normalized',hashes,scope:'七元素名称与技能显示；基础成长分别沿用已核验空／荧资料，不声明机制支持。'},forms};
writeFileSync(new URL('docs/constant/real-game/traveler-forms.json',root),JSON.stringify(output,null,2)+'\n');
