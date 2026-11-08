const labels:Record<string,string>={anemo:'风',geo:'岩',electro:'雷',dendro:'草',hydro:'水',pyro:'火',cryo:'冰'};
export function travelerForm(id:string|undefined){
  const match=id?.match(/^(aether|lumine)-(anemo|geo|electro|dendro|hydro|pyro|cryo)$/);
  return match?{baseId:match[1],element:match[2],talentName:`旅行者 (${labels[match[2]]}元素)`}:undefined;
}
