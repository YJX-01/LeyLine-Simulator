import { formulaDefinitionSchema, inspectCalculationStructure, type FormulaDefinition, type ValueType } from '@leyline/schema';
import type { FormulaGraph } from './formula-ir';
import { TemplateBuilder, quantityType as q } from './template-builder';
import { crit, defense, ordinaryBonus, ordinaryHit, panelBase, resistance, selectedCrit } from './templates-common';
import { additive, amplifying, ordinaryReaction, reactionHit, reactionMasteryBonus, transformative } from './templates-reactions';
export { standardReactionParameters } from './templates-reactions';

function scaledDamage(recipe: FormulaDefinition, selected: Extract<FormulaDefinition['template'], { id: 'scaled-damage' }>): FormulaGraph {
  const b = new TemplateBuilder(recipe), parts: string[] = [];
  for (const [index, term] of selected.terms.entries()) {
    const prefix = '$term' + index;
    const attribute = b.input(term.attribute, q(term.stat), { min: 0 });
    const ratio = b.input(term.ratio, q('scalar'), { min: 0 });
    let value = b.scale(prefix + '.scaled', attribute, ratio);
    if (term.count) {
      const unit = term.countUnit ?? 'count';
      const count = b.input(term.count, q(unit), { min: 0 });
      const zero = b.quantity(prefix + '.zeroCount', unit, 0);
      const enabled = b.compare(prefix + '.enabled', 'gt', count, zero);
      const scalar = unit === 'scalar' ? count : b.divide(prefix + '.count', count, b.quantity(prefix + '.oneCount', 'count', 1));
      const counted = b.multiply(prefix + '.counted', value, scalar);
      const absent = b.quantity(prefix + '.zeroDamage', 'damage', 0);
      value = b.select(prefix + '.value', enabled, counted, absent);
    }
    parts.push(value);
    b.stage('scaling-' + index, value, 'damage.scaling.' + term.stat);
  }
  const total = parts.slice(1).reduce((sum, part, index) => b.add('$sum' + index, sum, part), parts[0]);
  b.output(selected.output, total, q('damage')); b.stage('skill-base', total, 'damage.base');
  return b.finish();
}

function damageSum(recipe: FormulaDefinition, terms: number): FormulaGraph {
  const b = new TemplateBuilder(recipe), values = Array.from({ length: terms }, (_, index) => b.input('term' + index, q('damage')));
  const value = values.slice(1).reduce((sum, part, index) => b.add('$sum' + index, sum, part), values[0]);
  b.output('base', value, q('damage')); return b.finish();
}

function conditionalBonus(recipe: FormulaDefinition, selected: Extract<FormulaDefinition['template'], { id: 'conditional-bonus' | 'threshold-condition' }>): FormulaGraph {
  const b = new TemplateBuilder(recipe), input = b.input(selected.input, q('scalar'), { min: 0, max: 1 });
  const threshold = b.quantity('$threshold', 'scalar', selected.threshold), active = b.compare('$active', selected.relation, input, threshold);
  if (selected.id === 'threshold-condition') b.output('active', active, { kind: 'boolean' });
  else {
    const yes = b.quantity('$yes', 'scalar', selected.value), no = b.quantity('$no', 'scalar', selected.otherwise);
    b.output(selected.output, b.select('$value', active, yes, no), q('scalar'));
  }
  return b.finish();
}

function boundedStatBonus(recipe: FormulaDefinition, selected: Extract<FormulaDefinition['template'], { id: 'bounded-stat-bonus' }>): FormulaGraph {
  const b = new TemplateBuilder(recipe), input = b.input(selected.input, q(selected.stat), { min: 0 });
  const threshold = b.quantity('$threshold', selected.stat, selected.threshold), zero = b.quantity('$zero', selected.stat, 0);
  const excess = b.max('$excess', b.subtract('$difference', input, threshold), zero);
  const scalar = selected.stat === 'scalar' ? excess : b.divide('$normalized', excess, b.quantity('$oneUnit', selected.stat, 1));
  for (const [index, channel] of selected.channels.entries()) {
    const rate = b.quantity('$rate' + index, 'scalar', channel.rate), cap = b.quantity('$cap' + index, 'scalar', channel.cap);
    b.output(channel.output, b.min('$value' + index, b.multiply('$uncapped' + index, scalar, rate), cap), q('scalar'));
  }
  return b.finish();
}

function attributeConversion(recipe: FormulaDefinition, selected: Extract<FormulaDefinition['template'], { id: 'attribute-conversion' }>): FormulaGraph {
  const b = new TemplateBuilder(recipe), input = b.input(selected.attribute, q(selected.stat), { min: 0 });
  const rateUnit = selected.target === 'attack' ? 'attack' : 'scalar';
  const rate = b.input(selected.rate, q(rateUnit), { min: 0 });
  const normalized = selected.target === 'damage' ? input : b.divide('$normalized', input, b.quantity('$oneUnit', selected.stat, 1));
  const convert = (id: string, coefficient: string) => selected.target === 'damage' ? b.scale(id, normalized, coefficient) : b.multiply(id, normalized, coefficient);
  let value = convert('$base', rate);
  if (selected.conditionalRate) {
    const extra = selected.conditionalRate;
    const ratio = b.input(extra.input, q('scalar'), { min: 0, max: 1 }), threshold = b.quantity('$threshold', 'scalar', extra.threshold);
    const active = b.compare('$active', extra.relation, ratio, threshold), lowRate = b.input(extra.rate, q(rateUnit), { min: 0 });
    const bonus = b.select('$bonus', active, convert('$conditional', lowRate), b.quantity('$zero', selected.target, 0));
    value = b.add('$value', value, bonus);
  }
  b.output(selected.output, value, q(selected.target)); return b.finish();
}

function quantityCondition(recipe: FormulaDefinition, selected: Extract<FormulaDefinition['template'], { id: 'quantity-condition' }>): FormulaGraph {
  const b = new TemplateBuilder(recipe), input = b.input(selected.input, q(selected.unit), { min: 0, ...selected.maxInput === undefined ? {} : { max: selected.maxInput } });
  const threshold = b.quantity('$threshold', selected.unit, selected.threshold);
  b.output('active', b.compare('$active', selected.relation, input, threshold), { kind: 'boolean' }); return b.finish();
}

function enumCondition(recipe: FormulaDefinition, selected: Extract<FormulaDefinition['template'], { id: 'enum-condition' }>): FormulaGraph {
  const b = new TemplateBuilder(recipe), input = b.input(selected.input, { kind: 'enum', values: selected.values });
  const expected = b.constant('$expected', { kind: 'enum', value: selected.equals });
  b.output('active', b.compare('$active', 'eq', input, expected), { kind: 'boolean' }); return b.finish();
}

function conditionGroup(recipe: FormulaDefinition, selected: Extract<FormulaDefinition['template'], { id: 'condition-group' }>): FormulaGraph {
  const b = new TemplateBuilder(recipe), yes = b.constant('$true', { kind: 'boolean', value: true }), no = b.constant('$false', { kind: 'boolean', value: false });
  const terms = Array.from({ length: selected.terms }, (_, index) => b.input('term' + index, { kind: 'boolean' }));
  let value = b.node({ id: '$combined', op: 'condition-group', operator: selected.operator, conditions: terms });
  if (selected.negate) value = b.select('$negated', value, no, yes);
  b.output('active', value, { kind: 'boolean' }); return b.finish();
}

function linearBonus(recipe: FormulaDefinition, selected: Extract<FormulaDefinition['template'], { id: 'linear-bonus' }>): FormulaGraph {
  const b = new TemplateBuilder(recipe), input = b.input(selected.input, q(selected.inputUnit), { min: 0, ...selected.maxInput === undefined ? {} : { max: selected.maxInput } });
  const threshold = b.quantity('$threshold', selected.inputUnit, selected.threshold), zero = b.quantity('$zero', selected.inputUnit, 0);
  const excess = b.max('$excess', b.subtract('$difference', input, threshold), zero);
  const scalar = selected.inputUnit === 'scalar' ? excess : b.divide('$normalized', excess, b.quantity('$unit', selected.inputUnit, 1));
  const rate = b.quantity('$rate', selected.outputUnit, selected.rate), offset = b.quantity('$offset', selected.outputUnit, selected.offset);
  let value = b.add('$value', b.multiply('$scaled', scalar, rate), offset);
  if (selected.cap !== undefined) value = b.min('$capped', value, b.quantity('$cap', selected.outputUnit, selected.cap));
  b.output(selected.output, value, q(selected.outputUnit)); return b.finish();
}

/** Only known code templates can construct arithmetic. JSON supplies selectors and parameters. */
export function instantiateCalculationTemplate(recipe: FormulaDefinition): FormulaGraph {
  const selected = recipe.template;
  switch (selected.id) {
    case 'scaled-damage': return scaledDamage(recipe, selected);
    case 'damage-sum': return damageSum(recipe, selected.terms);
    case 'panel-base': return panelBase(recipe, selected.stat);
    case 'ordinary-hit': return ordinaryHit(recipe, selected.baseFlat);
    case 'ordinary-bonus': return ordinaryBonus(recipe);
    case 'defense': return defense(recipe);
    case 'resistance': return resistance(recipe);
    case 'crit': return crit(recipe);
    case 'read-milliseconds': {
      const b = new TemplateBuilder(recipe), value = b.input('value', q('milliseconds'), { min: 1 });
      b.output('value', value, q('milliseconds')); return b.finish();
    }
    case 'crit-selected': return selectedCrit(recipe, selected.calculation);
    case 'reaction-em-bonus': return reactionMasteryBonus(recipe);
    case 'standard-reaction': return { amplifying, additive, transformative }[selected.family](recipe);
    case 'ordinary-reaction': return ordinaryReaction(recipe, selected.element, selected.amplifying, selected.additive);
    case 'reaction-hit': return reactionHit(recipe, selected.family, selected.origin, selected.mastery, selected.baseMultiplier);
    case 'count-coefficient': {
      const b = new TemplateBuilder(recipe), count = b.input('count', q('count'), { min: 0, max: selected.max });
      b.output('value', b.lookup('$coefficient', selected.table, count), q('scalar')); return b.finish();
    }
    case 'radiance-ratio': {
      const b = new TemplateBuilder(recipe), mode = b.input('mode', { kind: 'enum', values: ['none', 'stellar-conduct', 'stellar-swirl'] });
      const matches = (value: string) => b.compare('$is-' + value, 'eq', mode, b.constant('$' + value, { kind: 'enum', value }));
      const radiant = b.select('$radiant', matches('stellar-conduct'), b.input('conduct', q('scalar')), b.input('swirl', q('scalar')));
      b.output('value', b.select('$ratio', matches('none'), b.input('ordinary', q('scalar')), radiant), q('scalar')); return b.finish();
    }
    case 'level-multiplier': {
      const b = new TemplateBuilder(recipe), level = b.input('level', q('count'), { min: 1, max: 100 });
      b.output('value', b.lookup('$value', selected.table, level), q('damage')); return b.finish();
    }
    case 'conditional-bonus': case 'threshold-condition': return conditionalBonus(recipe, selected);
    case 'quantity-condition': return quantityCondition(recipe, selected);
    case 'enum-condition': return enumCondition(recipe, selected);
    case 'condition-group': return conditionGroup(recipe, selected);
    case 'linear-bonus': return linearBonus(recipe, selected);
    case 'bounded-stat-bonus': return boundedStatBonus(recipe, selected);
    case 'attribute-conversion': return attributeConversion(recipe, selected);
    case 'stat-product': {
      const b = new TemplateBuilder(recipe);
      b.output('value', b.multiply('$product', b.input('basis', q(selected.unit)), b.input('rate', q('scalar'))), q(selected.unit));
      return b.finish();
    }
    case 'energy-full': {
      const b = new TemplateBuilder(recipe), capacity = b.input('capacity',q('energy'),{min:0});
      const positive = b.compare('$has-capacity','gt',capacity,b.quantity('$zero','energy',0));
      const equal = b.compare('$equal','eq',b.input('energy',q('energy'),{min:0}),capacity);
      b.output('active',b.select('$full',positive,equal,b.constant('$absent',{kind:'boolean',value:false})),{kind:'boolean'});
      return b.finish();
    }
    case 'capped-conversion': {
      const b = new TemplateBuilder(recipe), basis = b.input('basis', q(selected.from), { min: 0 });
      const excess = selected.threshold === undefined ? basis : b.max('$excess',
        b.subtract('$difference', basis, b.quantity('$threshold', selected.from, selected.threshold)), b.quantity('$zero', selected.from, 0));
      const units = b.divide('$units', excess, b.quantity('$divisor', selected.from, selected.per));
      const rate = b.input('rate', q('scalar'), { min: 0 }), cap = b.input('cap', q(selected.to), { min: 0 });
      const scaled = b.multiply('$scaled', units, rate);
      const value = selected.to === 'scalar' ? scaled : b.multiply('$amount', scaled, b.quantity('$one', selected.to, 1));
      b.output('value', b.min('$capped', value, cap), q(selected.to)); return b.finish();
    }
    case 'constant-bonus': {
      const b = new TemplateBuilder(recipe), value = b.constant('$value', selected.value);
      const type: ValueType = selected.value.kind === 'quantity' ? q(selected.value.unit)
        : selected.value.kind === 'boolean' ? { kind: 'boolean' } : { kind: 'enum', values: [selected.value.value] };
      b.output(selected.output, value, type); return b.finish();
    }
  }
}

/** Tooling can inspect code-owned signatures/constants without serializing executable operations. */
export function describeCalculationTemplate(input: FormulaDefinition) {
  const diagnostics = inspectCalculationStructure(input);
  if (diagnostics.length) throw Object.assign(new Error('模板配置包含非法结构。'), { diagnostics });
  const recipe = formulaDefinitionSchema.parse(input), graph = instantiateCalculationTemplate(recipe);
  return structuredClone({ inputs: graph.inputs, outputs: Object.fromEntries(Object.entries(graph.outputs).map(([id, output]) => [id, output.type])),
    stages: graph.stages, modifierPorts: graph.modifierPorts ?? {},
    constants: Object.fromEntries(graph.nodes.filter(node => node.op === 'constant').map(node => [node.id, node.value])),
    formulas: graph.nodes.filter(node => node.op === 'call').map(node => node.formula), tables: graph.nodes.filter(node => node.op === 'lookup').map(node => node.table) });
}
