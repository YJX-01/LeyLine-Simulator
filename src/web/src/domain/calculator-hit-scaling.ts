import { createTalentRankReader, definitionKey, talentParameterAt, type Build, type CalculationBinding,
  type CharacterDefinition } from '@leyline/schema';
import { realStatLabel } from './workbench-labels';

type Entity = CharacterDefinition | NonNullable<Build['weapon']> | Build['sets'][number];
type Base = CharacterDefinition['talents'][number]['hits'][number]['base'];
const percent = new Intl.NumberFormat('zh-CN', { style: 'percent', maximumFractionDigits: 4 });
const countNames: Record<string, string> = {
  resolve: '愿力', namisen: '浪闪层数', lightfallEnergy: '能量层数', counterCharge: '反击档位', frostglow: '寒辉层数',
};

/** Describe the base of one hit. Counts and conditional ratios stay visible as such. */
export function hitScalingReader(entity: Entity, character: CharacterDefinition, build: Build | undefined,
  rank: ReturnType<typeof createTalentRankReader>) {
  const templates = new Map(entity.calculation.bundle.formulas.map(row => [definitionKey(row.identity), row.template]));
  const talents = new Map(character.talents.map(talent => [talent.id, talent]));
  function coefficient(binding?: CalculationBinding): number | undefined {
    if (binding?.kind === 'constant' && binding.value.kind === 'quantity') return binding.value.value;
    if (binding?.kind === 'refinement-parameter' && build) return binding.values[build.refinement - 1];
    if (binding?.kind === 'talent-parameter') {
      const talent = talents.get(binding.skillId);
      if (talent) return talentParameterAt(talent, binding.parameterId, build ? rank(build, talent.category) : { level: 1 });
    }
    if (binding?.kind === 'formula' && templates.get(definitionKey(binding.formula))?.id === 'stat-product') {
      const basis = coefficient(binding.inputs.basis), rate = coefficient(binding.inputs.rate);
      if (basis !== undefined && rate !== undefined) return basis * rate;
    }
  }
  function factLabel(binding?: CalculationBinding) {
    if (binding?.kind === 'fact') return entity.metadata.facts?.[binding.key]?.label ?? countNames[binding.key] ?? '本击计数';
  }
  function ratioText(binding?: CalculationBinding): string | undefined {
    const value = coefficient(binding);
    if (value !== undefined) return percent.format(value);
    if (binding?.kind === 'formula' && templates.get(definitionKey(binding.formula))?.id === 'radiance-ratio') {
      return [['ordinary', '常态'], ['conduct', '星超导'], ['swirl', '星扩散']].map(([key, label]) =>
        label + ' ' + (ratioText(binding.inputs[key]) ?? '待定')).join(' / ');
    }
  }
  function describe(base: Base): string | undefined {
    const template = templates.get(definitionKey(base.formula)), inputs = base.bindings;
    function nested(binding: CalculationBinding | undefined) {
      return binding?.kind === 'formula' ? describe({ ...base, formula: binding.formula, bindings: binding.inputs }) : undefined;
    }
    if (template?.id === 'scaled-damage') {
      const terms = template.terms.map(term => {
        const ratio = ratioText(inputs[term.ratio]);
        if (!ratio) return undefined;
        const count = term.count && (factLabel(inputs[term.count]) ?? coefficient(inputs[term.count]));
        if (term.count && count === undefined) return undefined;
        return realStatLabel(term.stat) + ' × ' + ratio + (term.count ? ' × ' + count : '');
      });
      if (terms.every(Boolean)) return terms.join(' + ');
    }
    if (template?.id === 'damage-sum') {
      const terms = Array.from({ length: template.terms }, (_, i) => nested(inputs['term' + i]));
      if (terms.every(Boolean)) return terms.join(' + ');
    }
    if (template?.id === 'stat-product') {
      const basis = nested(inputs.basis);
      if (basis) return basis + ' × ' + (coefficient(inputs.rate) ?? '条件系数');
    }
    if (template?.id === 'linear-bonus' && template.outputUnit === 'damage' && template.offset === 0
      && template.threshold === 0 && !template.capInput && !template.capIncreases && !template.maxInput && !template.confirmedStep) {
      const basis = factLabel(inputs[template.input]);
      if (basis) return basis + ' × ' + percent.format(template.rate) + (template.cap !== undefined ? '（上限 ' + template.cap + '）' : '');
    }
  }
  return describe;
}
