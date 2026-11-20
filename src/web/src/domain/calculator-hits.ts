import type { CharacterDefinition } from '@leyline/schema';
import { realElementLabel } from './workbench-labels';

export interface CalculatorHitChoice {
  skillId: string;
  hitId: string;
  outputId?: string;
  group: string;
  alias: string;
  name: string;
  element: string;
  skillName: string;
  icon: string;
}

const categoryNames = { normal: '普通攻击', charged: '重击', plunge: '下落攻击', skill: '元素战技', burst: '元素爆发' };
const aliasPrefix = { normal: 'a', charged: 'z', plunge: '下落', skill: 'E', burst: 'Q' };
const ordinals = '一二三四五六七八九';
// These burst variants have separate energy costs and names in their own talent tables.
const alternateBursts: Record<string, string> = { 'varesa.burst': '大火山崩落', 'flins.burst': '雷霆交响' };

export function calculatorHitChoices(character: CharacterDefinition): CalculatorHitChoice[] {
  const choices: CalculatorHitChoice[] = [];
  for (const talent of character.talents) {
    const details = talent.details.map(detail => ({ ...detail, parameters: [...new Set(Array.from(detail.template.matchAll(/\{([^}:]+)(?::[^}]*)?\}/g), match => match[1]))] }));
    const icon = (character.derivedFrom?.id ?? character.id) + '-combat' + ({ normal: 1, skill: 2, burst: 3 }[talent.category]);
    const variant = alternateBursts[talent.id];
    const used = new Set<string>();
    const counts = new Map<string, number>();
    for (const hit of talent.hits) {
      const binding = Object.values(hit.base.bindings).find(value => value.kind === 'talent-parameter' && value.skillId === talent.id);
      const parameter = hit.parameter ?? (binding?.kind === 'talent-parameter' ? binding.parameterId : undefined);
      const detail = parameter && details.find(row => row.parameters.includes(parameter));
      if (parameter) used.add(parameter);
      const category = talent.category === 'normal' ? hit.category : talent.category;
      const stage = (counts.get(category) ?? 0) + 1;
      counts.set(category, stage);
      let name = detail ? detail.label : talent.name;
      // A template can describe separate impacts with different parameters, for example Xingqiu's third normal attack.
      if (detail && parameter && detail.parameters.length > 1 && detail.parameters.every(id => talent.hits.some(item => item.parameter === id))) {
        const index = detail.parameters.indexOf(parameter);
        if (detail.label === '低空/高空坠地冲击伤害') name = index === 0 ? '低空坠地冲击伤害' : '高空坠地冲击伤害';
        else name += '（第' + (index + 1) + '击）';
      }
      if (hit.id === 'vesna.skill.c6.slash') name = '六命翔风剑斩击';
      if (hit.id === 'vesna.skill.c6.spirit') name = '六命翔风剑灵剑';
      const ordinal = category === 'normal' && name.match(/([一二三四五六七八九])段/)?.[1];
      const alias = variant ? (name.includes(variant) ? '小q' : '大Q') : aliasPrefix[category] + (ordinal ? ordinals.indexOf(ordinal) + 1 : stage);
      const base = { skillId: talent.id, hitId: hit.id, group: categoryNames[category], alias, skillName: talent.name, element: hit.element, icon };
      if (!hit.outputs.length) choices.push({ ...base, name });
      for (const output of hit.outputs) {
        const suffix = output.family === 'stellar-swirl' && !name.includes('星扩散') ? '（星扩散）' : '';
        choices.push({ ...base, name: name + suffix, outputId: output.id });
      }
    }
    for (const detail of details) {
      if (!detail.label.endsWith('伤害') || !detail.parameters.length || detail.parameters.some(id => used.has(id))
        || !detail.parameters.some(id => talent.parameters.some(parameter => parameter.id === id && parameter.unit === 'ratio'))) continue;
      const category = talent.category === 'normal' && detail.label.includes('重击') ? 'charged'
        : talent.category === 'normal' && /下落|下坠|坠地/.test(detail.label) ? 'plunge' : talent.category;
      const index = (counts.get(category) ?? 0) + 1;
      counts.set(category,index);
      choices.push({ skillId: talent.id, hitId: talent.id + '.' + detail.parameters[0], group: categoryNames[category],
        alias: variant ? (detail.label.includes(variant) ? '小q' : '大Q') : aliasPrefix[category] + index, name: detail.label, skillName: talent.name, element: talent.element, icon });
    }
  }
  return choices;
}

export function hitSearchText(choice: CalculatorHitChoice) {
  return [choice.alias, choice.name, choice.group, choice.skillName, realElementLabel(choice.element)].join(' ').toLowerCase();
}
