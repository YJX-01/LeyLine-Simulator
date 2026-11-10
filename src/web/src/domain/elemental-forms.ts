const labels:Record<string,string>={anemo:'风',geo:'岩',electro:'雷',dendro:'草',hydro:'水',pyro:'火',cryo:'冰'};
/** Multi-element identities stay at the bottom regardless of sort direction. */
export function characterListGroup(id:string|undefined):number {
  const baseId=elementalForm(id)?.baseId ?? id;
  return baseId==='manekin' || baseId==='manekina' ? 2 : baseId==='aether' || baseId==='lumine' ? 1 : 0;
}
export function elementalForm(id:string|undefined){
  const match=id?.match(/^(aether|lumine|manekin|manekina)-(anemo|geo|electro|dendro|hydro|pyro|cryo)$/);
  return match?{baseId:match[1],element:match[2],talentName:`${match[1].startsWith('manekin')?'奇偶':'旅行者'} (${labels[match[2]]}元素)`}:undefined;
}
