import type { FormulaDefinition } from '@leyline/schema';
import type { FormulaGraph } from './formula-ir';
import { TemplateBuilder, quantityType as q } from './template-builder';

export function ordinaryHit(recipe: FormulaDefinition, baseFlat: 'attribute' | 'effect-port'): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('skillBase', q('damage'), {'required':true});
  b.input('baseMultiplier', q('scalar'), {'required':false,'default':{'kind':'quantity','unit':'scalar','value':1}});
  b.input('preReactionFlat', q('damage'), {'required':false,'default':{'kind':'quantity','unit':'damage','value':0}});
  b.input('additiveReactionBase', q('damage'), {'required':false,'default':{'kind':'quantity','unit':'damage','value':0}});
  b.input('ordinaryBonusMinusReduction', q('scalar'), {'required':true,'min':-1});
  b.input('critFactor', q('scalar'), {'required':true,'min':0});
  b.input('defenseFactor', q('scalar'), {'required':true,'min':0});
  b.input('resistanceFactor', q('scalar'), {'required':true,'min':0});
  b.input('amplificationFactor', q('scalar'), {'required':false,'default':{'kind':'quantity','unit':'scalar','value':1}});
  b.input('elevationFactor', q('scalar'), {'required':false,'min':0,'default':{'kind':'quantity','unit':'scalar','value':1}});
  b.quantity('one', 'scalar', 1);
  b.multiply('scaledBase', 'skillBase', 'baseMultiplier');
  b.add('preReactionBase', 'scaledBase', 'preReactionFlat');
  b.add('base', 'preReactionBase', 'additiveReactionBase');
  b.add('bonus', 'one', 'ordinaryBonusMinusReduction');
  b.multiply('afterBonus', 'base', 'bonus');
  b.multiply('afterCrit', 'afterBonus', 'critFactor');
  b.multiply('afterDefense', 'afterCrit', 'defenseFactor');
  b.multiply('afterResistance', 'afterDefense', 'resistanceFactor');
  b.multiply('afterAmplification', 'afterResistance', 'amplificationFactor');
  b.multiply('value', 'afterAmplification', 'elevationFactor');
  if (baseFlat === 'effect-port') b.graph.modifierPorts = { 'base-flat': { input: 'preReactionFlat', type: q('damage'), combine: 'sum', neutral: { kind: 'quantity', unit: 'damage', value: 0 }, scope: 'hit' } };
  b.output('value', 'value', q('damage'));
  b.stage('skill-base', 'skillBase', 'damage.skill-base');
  b.stage('base-multiplier', 'baseMultiplier', 'damage.base-multiplier');
  b.stage('base-flat', 'preReactionFlat', 'damage.base-flat');
  b.stage('reaction-base', 'additiveReactionBase', 'damage.reaction-base');
  b.stage('bonus', 'bonus', 'damage.bonus');
  b.stage('crit', 'critFactor', 'damage.crit');
  b.stage('defense', 'defenseFactor', 'damage.defense');
  b.stage('resistance', 'resistanceFactor', 'damage.resistance');
  b.stage('amplification', 'amplificationFactor', 'damage.amplification');
  b.stage('ordinary-elevation', 'elevationFactor', 'damage.elevation');
  return b.finish();
}

export function ordinaryBonus(recipe: FormulaDefinition): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('elementBonus', q('scalar'), {'required':true});
  b.input('hitBonus', q('scalar'), {'required':true});
  b.input('targetReduction', q('scalar'), {'required':true});
  b.add('bonus', 'elementBonus', 'hitBonus');
  b.subtract('value', 'bonus', 'targetReduction');
  b.output('value', 'value', q('scalar'));
  return b.finish();
}

export function defense(recipe: FormulaDefinition): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('characterLevel', q('count'), {'required':true,'min':1,'max':100});
  b.input('enemyLevel', q('count'), {'required':true,'min':1,'max':200});
  b.input('reduction', q('scalar'), {'required':true,'min':0});
  b.input('ignore', q('scalar'), {'required':true,'min':0,'max':1});
  b.quantity('hundred', 'count', 100);
  b.quantity('one', 'scalar', 1);
  b.quantity('maxDefenseReduction', 'scalar', 0.9);
  b.quantity('oneCount', 'count', 1);
  b.add('ownOffset', 'characterLevel', 'hundred');
  b.add('enemyOffset', 'enemyLevel', 'hundred');
  b.divide('own', 'ownOffset', 'oneCount');
  b.divide('enemy', 'enemyOffset', 'oneCount');
  b.min('cappedDefenseReduction', 'reduction', 'maxDefenseReduction');
  b.subtract('remainingDefense', 'one', 'cappedDefenseReduction');
  b.subtract('remainingIgnore', 'one', 'ignore');
  b.multiply('reducedEnemy', 'enemy', 'remainingDefense');
  b.multiply('ignoredEnemy', 'reducedEnemy', 'remainingIgnore');
  b.add('denominator', 'own', 'ignoredEnemy');
  b.divide('value', 'own', 'denominator');
  b.output('value', 'value', q('scalar'));
  b.stage('defense', 'value', 'damage.defense');
  return b.finish();
}

export function resistance(recipe: FormulaDefinition): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('resistance', q('scalar'), {'required':true});
  b.quantity('zero', 'scalar', 0);
  b.quantity('one', 'scalar', 1);
  b.quantity('two', 'scalar', 2);
  b.quantity('four', 'scalar', 4);
  b.quantity('threshold', 'scalar', 0.75);
  b.compare('negative', 'lt', 'resistance', 'zero');
  b.compare('low', 'lt', 'resistance', 'threshold');
  b.divide('halfResistance', 'resistance', 'two');
  b.subtract('negativeFactor', 'one', 'halfResistance');
  b.subtract('lowFactor', 'one', 'resistance');
  b.multiply('fourResistance', 'four', 'resistance');
  b.add('highDenominator', 'fourResistance', 'one');
  b.divide('highFactor', 'one', 'highDenominator');
  b.select('nonnegativeFactor', 'low', 'lowFactor', 'highFactor');
  b.select('value', 'negative', 'negativeFactor', 'nonnegativeFactor');
  b.output('value', 'value', q('scalar'));
  b.stage('resistance', 'value', 'damage.resistance');
  return b.finish();
}

export function crit(recipe: FormulaDefinition): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('critRate', q('scalar'), {'required':true});
  b.input('critDamage', q('scalar'), {'required':true,'min':0});
  b.quantity('zero', 'scalar', 0);
  b.quantity('one', 'scalar', 1);
  b.max('nonnegativeRate', 'critRate', 'zero');
  b.min('clampedRate', 'nonnegativeRate', 'one');
  b.add('critical', 'one', 'critDamage');
  b.multiply('weightedDamage', 'clampedRate', 'critDamage');
  b.add('expected', 'one', 'weightedDamage');
  b.output('noncritical', 'one', q('scalar'));
  b.output('critical', 'critical', q('scalar'));
  b.output('expected', 'expected', q('scalar'));
  b.stage('crit-rate', 'clampedRate', 'damage.crit-rate');
  return b.finish();
}

export function panelBase(recipe: FormulaDefinition, stat: 'hp' | 'attack' | 'defense'): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('white', q(stat), {'required':true});
  b.input('percent', q('scalar'), {'required':true});
  b.input('flat', q(stat), {'required':true});
  b.quantity('one', 'scalar', 1);
  b.add('factor', 'one', 'percent');
  b.multiply('scaled', 'white', 'factor');
  b.add('value', 'scaled', 'flat');
  b.output('value', 'value', q(stat));
  return b.finish();
}

export function selectedCrit(recipe: FormulaDefinition, calculation: import('@leyline/schema').DefinitionRef): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('mode', {'kind':'enum','values':['noncritical','critical','expected']}, {'required':true});
  b.input('critRate', q('scalar'), {'required':true});
  b.input('critDamage', q('scalar'), {'required':true});
  b.quantity('one', 'scalar', 1);
  b.constant('noncritical', {'kind':'enum','value':'noncritical'});
  b.constant('critical', {'kind':'enum','value':'critical'});
  b.compare('isNoncritical', 'eq', 'mode', 'noncritical');
  b.compare('isCritical', 'eq', 'mode', 'critical');
  b.call('criticalValue', calculation, {'critRate':'critRate','critDamage':'critDamage'}, 'critical');
  b.call('expectedValue', calculation, {'critRate':'critRate','critDamage':'critDamage'}, 'expected');
  b.select('selectedCrit', 'isCritical', 'criticalValue', 'expectedValue');
  b.select('value', 'isNoncritical', 'one', 'selectedCrit');
  b.output('value', 'value', q('scalar'));
  return b.finish();
}
