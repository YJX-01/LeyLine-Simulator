import { enkaAvatarSchema, enkaResponseSchema } from '@leyline/schema/enka';
import { realBuildSchema, type RealArtifact, type RealStat } from '@leyline/schema';
import { getRealCharacter, getRealWeapon, getRealSet } from '@leyline/game-data/real';
import mapping from './data/enka-catalog.json';
import { loadAccountGameData } from './account-presentation';
import { accountSlotLabels, cloneAccount, parseAccount, type LocalAccount, type AccountCharacter, type AccountSlot } from './account';
import { ratioStat, validateAccountArtifact } from './account-real';

const stats: Record<string,RealStat> = { HP:'hp',HP_PERCENT:'hpPercent',ATTACK:'attack',ATTACK_PERCENT:'attackPercent',DEFENSE:'defense',DEFENSE_PERCENT:'defensePercent',CRITICAL:'critRate',CRITICAL_HURT:'critDamage',CHARGE_EFFICIENCY:'energyRecharge',ELEMENT_MASTERY:'elementalMastery',HEAL_ADD:'healingBonus',PHYSICAL_ADD_HURT:'physicalBonus',FIRE_ADD_HURT:'pyroBonus',ELEC_ADD_HURT:'electroBonus',WATER_ADD_HURT:'hydroBonus',GRASS_ADD_HURT:'dendroBonus',WIND_ADD_HURT:'anemoBonus',ROCK_ADD_HURT:'geoBonus',ICE_ADD_HURT:'cryoBonus' };
const slots: Record<string,AccountSlot> = { EQUIP_BRACER:'flower',EQUIP_NECKLACE:'plume',EQUIP_SHOES:'sands',EQUIP_RING:'goblet',EQUIP_DRESS:'circlet' };
const characterMap: Record<string,{id:string;skills:number[];skillDepotId?:number}> = mapping.characters;
const weaponMap: Record<string,string> = mapping.weapons;
const setMap: Record<string,string> = mapping.sets;
const hash = async (content:string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content))),byte=>byte.toString(16).padStart(2,'0')).join('');
function stat(name:string,value:number|undefined) {
  const stat = stats[name.replace(/^FIGHT_PROP_/,'')];
  if (!stat || value === undefined || !Number.isFinite(value) || value <= 0) throw new Error('存在尚未支持或缺失的装备词条。');
  return { stat,value:value/(ratioStat(stat)?100:1) };
}
export interface EnkaPreview { accountId:string; uid:string; nickname:string; ttl:number; rows:{character:AccountCharacter; before?:string; action:'add'|'complete'|'update'}[]; skipped:string[] }
export async function previewEnkaImport(input:unknown,uid:string,account:LocalAccount):Promise<EnkaPreview> {
  const response = enkaResponseSchema.parse(input);
  if (response.uid !== undefined && String(response.uid) !== uid) throw new Error('响应 UID 与查询不一致，未读取。');
  const data = await loadAccountGameData();
  const {recordedRolls}=await import('./artifact-rolls');
  const preview:EnkaPreview = { accountId:account.id,uid,nickname:response.playerInfo.nickname??'',ttl:Math.max(0,response.ttl??60),rows:[],skipped:[] };
  const rawHash = await hash(JSON.stringify(input));
  const seen = new Set<string>();
  for (const raw of response.avatarInfoList??[]) {
    let label='展柜角色';
    try {
      const value=enkaAvatarSchema.parse(raw); const entry=characterMap[String(value.avatarId)];
      label=data.catalog.characters.find(character=>character.id===entry?.id)?.name??`角色 ${value.avatarId}`;
      if (!entry) throw new Error('当前角色目录尚未收录，暂不能导入。');
      if (['aether','lumine','manekin','manekina'].includes(entry.id)) throw new Error('该角色的多元素形态暂未适配，暂不能导入。');
      if (entry.skillDepotId!==undefined && value.skillDepotId!==entry.skillDepotId) throw new Error('该角色的天赋形态与已核验资料不一致，暂不能导入。');
      if (entry.skills.length!==3) throw new Error('当前导入器尚缺该角色的天赋编号适配，暂不能导入；无需调整游戏内的展柜设置。');
      if (seen.has(entry.id)) throw new Error('展柜中角色身份重复。'); seen.add(entry.id);
      const weaponEntry=value.equipList.find(item=>item.weapon); const weaponId=weaponEntry&&weaponMap[String(weaponEntry.itemId)];
      if (!weaponEntry?.weapon||!weaponId) throw new Error('缺少武器或武器身份未收录。');
      const [character,weapon]=await Promise.all([getRealCharacter(entry.id),getRealWeapon(weaponId)]);
      if (character.weaponType!==weapon.weaponType) throw new Error('角色与武器类型不匹配。');
      const artifacts:RealArtifact[]=[];
      for (const item of value.equipList.filter(item=>item.reliquary)) {
        const slot=slots[item.flat.equipType??'']; const setId=setMap[String(item.flat.setId??/^UI_RelicIcon_(\d+)_/.exec(item.flat.icon)?.[1])];
        if (!slot||!setId||item.flat.rankLevel!==5||!item.flat.reliquaryMainstat) throw new Error('圣遗物存在未支持的星级、部位或套装。');
        if (artifacts.some(item=>item.slot===slot)) throw new Error('圣遗物部位重复。');
        const primary=stat(item.flat.reliquaryMainstat.mainPropId,item.flat.reliquaryMainstat.statValue??item.flat.reliquaryMainstat.propValue);
        const piece:RealArtifact={id:`showcase:${uid}:${value.avatarId}:${slot}`,setId,slot,rarity:5,level:item.reliquary!.level-1,mainStat:primary.stat,
          substats:(item.flat.reliquarySubstats??[]).map(sub=>stat(sub.appendPropId??sub.appendPropID??'',sub.statValue??sub.propValue)),
          source:{format:'enka-showcase',key:`${uid}/${value.avatarId}/${slot}`,fingerprint:await hash(JSON.stringify(item))} };
        recordedRolls(piece,item.reliquary!.appendPropIdList);
        validateAccountArtifact(piece); artifacts.push(piece);
      }
      const sets=await Promise.all([...new Set(artifacts.map(item=>item.setId))].map(id=>getRealSet(id)));
      const prop=(id:string)=>Number(value.propMap[id]?.val??value.propMap[id]?.ival);
      const levels=entry.skills.map(id=>value.skillLevelMap[String(id)]);
      if (levels.some(level=>level===undefined)) throw new Error('缺少天赋等级，未使用默认值填补。');
      const currentHp=value.fightPropMap['1010'],maximumHp=value.fightPropMap['2000'];
      if (!Number.isFinite(currentHp)||!(maximumHp>0)||currentHp<0||currentHp>maximumHp) throw new Error('缺少有效的生命值条件，未使用满生命值替代。');
      const refinements=Object.values(weaponEntry.weapon.affixMap??{});
      if (!refinements.length&&weapon.rarity>2) throw new Error('缺少武器精炼等级。');
      const build=realBuildSchema.parse({dataVersion:data.catalog.version,character,weapon,artifactMain:data.main,sets,level:prop('4001'),ascension:prop('1002'),constellation:value.talentIdList?.length??0,
        talents:{normal:levels[0],skill:levels[1],burst:levels[2]},weaponLevel:weaponEntry.weapon.level,weaponAscension:weaponEntry.weapon.promoteLevel,refinement:(refinements[0]??0)+1,hpRatio:currentHp/maximumHp,artifacts});
      const current=account.characters.find(item=>item.realBuild?.character.id===entry.id||item.name===character.name);
      preview.rows.push({action:current?.realBuild?'update':current?'complete':'add',before:current?JSON.stringify(current):undefined,character:{...current,id:current?.id??crypto.randomUUID(),name:current?.name??character.name,attack:0,weapon:weapon.name,equipment:{...current?.equipment},
        realBuild:{...build,artifacts:[],sets:[]},showcase:{uid,avatarId:value.avatarId,fetchedAt:new Date().toISOString(),rawHash,build}}});
    } catch(cause) { preview.skipped.push(`${label}：${cause instanceof Error && cause.name === 'ZodError'?'培养或装备数值不在当前支持范围，请在预览中核对。':cause instanceof Error?cause.message:'资料解析失败。'}`); }
  }
  return preview;
}
export function confirmEnkaImport(account:LocalAccount,preview:EnkaPreview,selectedIds:string[]):number {
  if (account.id!==preview.accountId) throw new Error('账号已切换，请重新查询。');
  const next=cloneAccount(account);let count=0;
  for(const row of preview.rows.filter(row=>selectedIds.includes(row.character.id))) {
    const index=next.characters.findIndex(item=>item.id===row.character.id);
    if (row.before ? index<0||JSON.stringify(next.characters[index])!==row.before : index>=0||next.characters.some(item=>item.name===row.character.name)) throw new Error('预览后角色资料已变化，请重新查询。');
    if (index>=0) next.characters[index]=row.character;else next.characters.push(row.character);count++;
  }
  if (!count) throw new Error('请先选择要导入的角色。');
  account.characters=parseAccount(next).characters;
  return count;
}
export function showcaseArtifact(character:AccountCharacter,slot:AccountSlot) {
  const real=character.showcase?.build.artifacts.find(item=>item.slot===slot);
  if (!real) return undefined;
  return {id:real.id,slot,attack:0,real,name:`${character.showcase!.build.sets.find(set=>set.id===real.setId)?.name??'展柜装备'} · ${accountSlotLabels[slot]}`};
}
