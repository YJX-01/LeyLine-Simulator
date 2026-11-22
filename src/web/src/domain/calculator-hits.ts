import { equipmentHits, type Build, characterHitRef, type HitRef, type CharacterDefinition } from '@leyline/schema';
import { damageFamilyLabel, realElementLabel } from './workbench-labels';

export interface CalculatorHitChoice {
  skillId: string;
  hitId: string;
  ref: HitRef;
  available: boolean;
  group: string;
  alias: string;
  name: string;
  element: string;
  skillName: string;
  icon: string;
  iconKind?: 'weapons' | 'artifacts';
}

const categoryNames = { normal: '普通攻击', charged: '重击', plunge: '下落攻击', skill: '元素战技', burst: '元素爆发' };
const aliasPrefix = { normal: 'a', charged: 'z', plunge: '下落', skill: 'E', burst: 'Q' };
const ordinals = '一二三四五六七八九';
// These burst variants have separate energy costs and names in their own talent tables.
const alternateBursts: Record<string, string> = { 'varesa.burst': '大火山崩落', 'flins.burst': '雷霆交响' };

export function calculatorHitChoices(character: CharacterDefinition, build?: Build): CalculatorHitChoice[] {
  const choices: CalculatorHitChoice[] = [];
  for (const talent of character.talents) {
    const icon = (character.derivedFrom?.id ?? character.id) + '-combat' + ({ normal: 1, skill: 2, burst: 3 }[talent.category]);
    const variant = alternateBursts[talent.id];
    const counts = new Map<string, number>();
    for (const hit of talent.hits) {
      const category = talent.category === 'normal' ? hit.category : talent.category;
      const stage = (counts.get(category) ?? 0) + 1;
      counts.set(category, stage);
      const name = hit.name;
      const ordinal = category === 'normal' && name.match(/([一二三四五六七八九])段/)?.[1];
      const alias = variant ? (name.includes(variant) ? '小q' : '大Q') : aliasPrefix[category] + (ordinal ? ordinals.indexOf(ordinal) + 1 : stage);
      const base = { skillId: talent.id, hitId: hit.id, group: categoryNames[category], alias, skillName: talent.name, element: hit.element, icon };
      const families = Object.keys(hit.damage), family = families.length === 1 ? families[0] : undefined;
      const suffix = family && family !== 'ordinary' && !name.includes(damageFamilyLabel(family)) ? '（' + damageFamilyLabel(family) + '）' : '';
      choices.push({ ...base, ref: characterHitRef(character, hit.id), available: families.length > 0, name: name + suffix });
    }

  }
  if (build) for (const { entity, ref, hit } of equipmentHits(build)) choices.push({ ref, hitId: hit.id, skillId: entity.id,
    name: hit.name, alias: entity.name, skillName: entity.name, group: entity.kind === 'weapon-definition' ? '武器' : '圣遗物',
    available: true, element: hit.element, icon: entity.id, iconKind: entity.kind === 'weapon-definition' ? 'weapons' : 'artifacts' });
  return choices;
}

export function hitSearchText(choice: CalculatorHitChoice) {
  return [choice.alias, choice.name, choice.group, choice.skillName, realElementLabel(choice.element)].join(' ').toLowerCase();
}
