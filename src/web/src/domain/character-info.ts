import { talentLevelBonus, type CharacterDefinition, type Talent } from '@leyline/schema';

export function talentBonus(character:CharacterDefinition,category:Talent['category'],constellation:number):number {
  return talentLevelBonus(character, category, constellation);
}
export function talentDisplayRows(character:CharacterDefinition) {
  const base=character.derivedFrom?.id ?? character.id;
  return character.talents.map(talent=>({key:talent.category,name:talent.name,label:{normal:'A',skill:'E',burst:'Q'}[talent.category],
    icon:`${base}-combat${{normal:1,skill:2,burst:3}[talent.category]}`,constellations:character.constellations.filter(item=>item.talentBonuses.some(bonus=>bonus.category===talent.category)).map(item=>item.rank)}));
}
export function formatTalentDetail(talent:Talent,template:string,level:number):string {
  return template.replace(/\{([^}:]+)(?::([^}]+))?\}/g,(_,id:string,format?:string)=>{
    const value=talent.parameters.find(parameter=>parameter.id===id)?.values[level-1];
    if(value===undefined)return '未收录';
    const percent=format?.includes('P') ?? false, decimals=format?.match(/F(\d+)/)?.[1];
    const displayed=percent?value*100:value;
    const text=decimals!==undefined?displayed.toFixed(Math.min(8,Number(decimals))):format==='I'?displayed.toFixed(0):String(Number(displayed.toPrecision(12)));
    return text+(percent?'%':'');
  });
}
