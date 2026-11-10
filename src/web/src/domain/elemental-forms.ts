const labels:Record<string,string>={anemo:'风',geo:'岩',electro:'雷',dendro:'草',hydro:'水',pyro:'火',cryo:'冰'};
export function elementalForm(id:string|undefined){
  const match=id?.match(/^(aether|lumine|manekin|manekina)-(anemo|geo|electro|dendro|hydro|pyro|cryo)$/);
  return match?{baseId:match[1],element:match[2],talentName:`${match[1].startsWith('manekin')?'奇偶':'旅行者'} (${labels[match[2]]}元素)`}:undefined;
}
