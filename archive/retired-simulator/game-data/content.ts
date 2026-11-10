import generated from './generated/legacy/content.json';
export type CharacterKey = 'jean' | 'xingqiu' | 'hutao' | 'albedo' | 'raiden';
export type WeaponKey = 'harbinger-of-dawn' | 'favonius-sword' | 'sacrificial-sword' | 'festering-desire' | 'white-tassel' | 'prototype-starglitter' | 'staff-of-homa' | 'engulfing-lightning';
export interface BaseCharacter {
  sourceName: string;
  base: { rarity: number; weapon: number; element: number; HP_BASE: number; ATK_BASE: number; DEF_BASE: number; asc: Record<string, number[]> };
  skills: Record<'A' | 'E' | 'Q', Record<string, number[]>>;
  frames: Record<'A' | 'E' | 'Q', number[]>;
}
export interface BaseWeapon {
  name: string; rarity: number; weapon_type: number; sub_stat: string; stat_base: number; stat_curve: string;
  ATK_BASE: number; atk_curve: string; skill: { param_list: number[][] };
}
export interface ContentData {
  version: string; characters: Record<CharacterKey, BaseCharacter>; weapons: Record<WeaponKey, BaseWeapon>;
  growth: Record<string, number[]>; weaponGrowth: Record<string, number[]>;
  artifactMain: Record<string, number[]>; artifactAllowed: Record<string, string[]>; artifactSubstats: string[];
  reactionLevels: number[];
}
export const content = generated as unknown as ContentData;
export const characterNames: Record<CharacterKey, string> = { jean: '琴', xingqiu: '行秋', hutao: '胡桃', albedo: '阿贝多', raiden: '雷电将军' };
export const characterElements = { jean: 'anemo', xingqiu: 'hydro', hutao: 'pyro', albedo: 'geo', raiden: 'electro' } as const;
