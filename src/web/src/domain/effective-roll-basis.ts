import type {Build} from '@leyline/schema';
import defaults from '../../generated/effective-roll-basis.json';

export interface EffectiveRollBasis {
  hp:number;attack:number;defense:number;source:'build'|'default';
  characterId?:string;weaponId?:string;weaponName?:string;level?:number;weaponLevel?:number;
}
export function defaultRollBasis():EffectiveRollBasis {return {...defaults.defaults,source:'default'};}
/** White stats only: no artifact mains, bonuses, passives, teammates, or temporary buffs. */
export function buildRollBasis(build?:Pick<Build,'character'|'weapon'|'level'|'ascension'|'weaponLevel'|'weaponAscension'>):EffectiveRollBasis {
  if(!build)return defaultRollBasis();
  const {character,weapon}=build,promotion=character.progression.promotion[build.ascension],weaponPromotion=weapon.promotion[build.weaponAscension];
  if(!promotion || weaponPromotion===undefined)return defaultRollBasis();
  const hp=character.attributes.base.hp*character.progression.curves.hp[build.level]+promotion.hp;
  const attack=character.attributes.base.attack*character.progression.curves.attack[build.level]+promotion.attack+weapon.baseAttack*weapon.attackCurve[build.weaponLevel]+weaponPromotion;
  const defense=character.attributes.base.defense*character.progression.curves.defense[build.level]+promotion.defense;
  if(![hp,attack,defense].every(value=>Number.isFinite(value) && value>0))return defaultRollBasis();
  return {hp,attack,defense,source:'build',characterId:character.id,weaponId:weapon.id,weaponName:weapon.name,level:build.level,weaponLevel:build.weaponLevel};
}
export function readRollBasis(value:unknown):EffectiveRollBasis {
  if(value===undefined)return defaultRollBasis();
  if(!value || typeof value!=='object')throw new Error('组合折算基准无效。');
  const basis=value as EffectiveRollBasis;
  if(!['build','default'].includes(basis.source) || ![basis.hp,basis.attack,basis.defense].every(number=>Number.isFinite(number) && number>0 && number<1e9))throw new Error('组合折算基准无效。');
  for(const key of ['characterId','weaponId','weaponName'] as const)if(basis[key]!==undefined && (typeof basis[key]!=='string' || basis[key]!.length>200))throw new Error('组合折算基准无效。');
  for(const key of ['level','weaponLevel'] as const)if(basis[key]!==undefined && (!Number.isInteger(basis[key]) || basis[key]!<1 || basis[key]!>100))throw new Error('组合折算基准无效。');
  return {...basis};
}
