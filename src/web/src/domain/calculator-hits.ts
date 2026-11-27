import { createTalentRankReader, equipmentHits, type Build, characterHitRef, type HitRef, type CharacterDefinition, type CalculatorDamageGroup } from '@leyline/schema';
import { authoredHitEntries } from '@leyline/schema/hit-bindings';
import { damageFamilyLabel, realElementLabel } from './workbench-labels';
import { hitScalingReader } from './calculator-hit-scaling';

export interface CalculatorHitChoice {
  skillId: string;
  hitId: string;
  ref: HitRef;
  available: boolean;
  requirement?: string;
  group: CalculatorDamageGroup;
  source: string;
  code: string;
  alias?: string;
  note?: string;
  scaling?: string;
  common: boolean;
  name: string;
  element: string;
  skillName: string;
  icon: string;
  iconKind?: 'weapons' | 'artifacts';
}

export const damageGroupNames = { normal: '普通攻击', charged: '重击', plunge: '下落攻击', skill: '元素战技', burst: '元素爆发', other: '独立伤害', weapon: '武器', set: '圣遗物', reaction: '剧变反应', scene: '场景冲击', common: '常用' };
const codePrefix = { normal: 'a', charged: 'z', plunge: 'x', skill: 'e', burst: 'q', other: '追加' };
const ordinals = '一二三四五六七八九';
export function calculatorHitChoices(character: CharacterDefinition, build?: Build,
  rank = createTalentRankReader([{ build }])): CalculatorHitChoice[] {
  const choices: CalculatorHitChoice[] = [];
  const display = character.metadata.calculator;
  const pinned = display?.pinnedHits ?? [];
  const scaling = hitScalingReader(character, character, build, rank);
  let plungeStage = 0;
  const nextPlungeCode = () => 'x' + (++plungeStage);
  for (const talent of character.talents) {
    const icon = (character.derivedFrom?.id ?? character.id) + '-combat' + ({ normal: 1, skill: 2, burst: 3 }[talent.category]);
    const source = damageGroupNames[talent.category];
    const counts = new Map<string, number>();
    const grants = new Map(authoredHitEntries(character.metadata, talent.id).map(entry => [entry.hit.id, entry.unlock]));
    for (const hit of talent.hits) {
      const category = talent.category === 'normal' || hit.category === 'other' ? hit.category : talent.category;
      const stage = (counts.get(category) ?? 0) + 1;
      counts.set(category, stage);
      const name = hit.name;
      const ordinal = category === 'normal' && name.match(/([一二三四五六七八九])段/)?.[1];
      const prefix = codePrefix[category];
      const families = Object.keys(hit.damage), family = families.length === 1 ? families[0] : undefined;
      const card = display?.hits?.[hit.id];
      const code = card?.code ?? (hit.category === 'plunge' ? nextPlungeCode()
        : category === 'skill' && family === 'stellar-conduct' ? '超导e'
        : hit.selection?.kind ? prefix : prefix + (ordinal ? ordinals.indexOf(ordinal) + 1 : stage));
      const alias = card?.alias ?? (name === '技能伤害' ? talent.name : undefined);
      const unlock = grants.get(hit.id);
      const requirement = build && unlock && build[unlock.state] < unlock.rank
        ? (unlock.state === 'constellation' ? '需要命座 ' : '需要突破 ') + unlock.rank : undefined;
      const count = hit.selection?.repetitions;
      const independent = !talent.noIndependentDamage || hit.origin === 'triggered';
      const notes = [
        card?.note,
        talent.hits.some(other => other.name === name && other.element !== hit.element) ? realElementLabel(hit.element) + '形态' : undefined,
        family && family !== 'ordinary' && !name.includes(damageFamilyLabel(family)) ? damageFamilyLabel(family) : undefined,
        count ? '单击，共' + count + '击' : undefined,
        requirement ?? (families.length && independent ? undefined : '尚未支持'),
      ];
      choices.push({ skillId: talent.id, hitId: hit.id, group: hit.category, source, code, alias, skillName: talent.name,
        element: hit.element, icon, ref: characterHitRef(character, hit.id), available: !requirement && families.length > 0 && independent,
        requirement, name, note: notes.filter(Boolean).join('，'), scaling: scaling(hit.base), common: pinned.includes(hit.id) });
    }
  }
  const equipmentCounts = { weapon: 0, set: 0 };
  if (build) for (const { entity, ref, hit } of equipmentHits(build)) {
    const weapon = entity.kind === 'weapon-definition', origin = weapon ? 'weapon' : 'set';
    const card = entity.metadata.calculator?.hits?.[hit.id], stage = ++equipmentCounts[origin];
    choices.push({ ref, hitId: hit.id, skillId: entity.id, code: card?.code ?? (hit.category === 'plunge' ? nextPlungeCode() : damageGroupNames[origin] + stage),
      name: hit.name, alias: card?.alias, skillName: entity.name, source: entity.name, group: hit.category ?? origin, note: card?.note,
      scaling: hitScalingReader(entity, character, build, rank)(hit.base), common: false,
      available: true, element: hit.element, icon: entity.id, iconKind: weapon ? 'weapons' : 'artifacts' });
  }
  const byId = new Map(choices.filter(choice => choice.common).map(choice => [choice.hitId, choice]));
  return [...pinned.flatMap(id => byId.get(id) ?? []), ...choices.filter(choice => !choice.common)];
}

export function hitSearchText(choice: CalculatorHitChoice) {
  return [choice.code, choice.alias, choice.name, choice.note, damageGroupNames[choice.group], choice.source, choice.skillName, realElementLabel(choice.element)].join(' ').toLowerCase();
}
