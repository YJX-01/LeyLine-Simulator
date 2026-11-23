import type { FormulaDefinition, DefinitionRef, Element } from '@leyline/schema';
import type { FormulaGraph } from './formula-ir';
import { TemplateBuilder, quantityType as q } from './template-builder';

export const standardReactionParameters = Object.freeze({
  amplifying: Object.freeze({ emNumerator: 2.78, emDenominator: 1400,
    vaporize: Object.freeze({ hydro: 2, pyro: 1.5 }), melt: Object.freeze({ pyro: 2, cryo: 1.5 }) }),
  additive: Object.freeze({ emNumerator: 5, emDenominator: 1200, aggravate: 1.15, spread: 1.25 }),
});
const directCoefficients = { 'lunar-bloom': 1, 'lunar-charged': 3, 'lunar-crystallize': 1.6, 'stellar-swirl': 1 } as const;

export function amplifying(recipe: FormulaDefinition): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('em', q('elementalMastery'), {'required':true,'min':0});
  b.input('reactionBonus', q('scalar'), {'required':true});
  b.input('reactionCoefficient', q('scalar'), {'required':true,'min':0});
  b.quantity('one', 'scalar', 1);
  b.quantity('emNumerator', 'scalar', standardReactionParameters.amplifying.emNumerator);
  b.quantity('emDenominator', 'elementalMastery', standardReactionParameters.amplifying.emDenominator);
  b.multiply('scaledEm', 'em', 'emNumerator');
  b.add('emDenominatorTotal', 'emDenominator', 'em');
  b.divide('emBonus', 'scaledEm', 'emDenominatorTotal');
  b.add('bonus', 'emBonus', 'reactionBonus');
  b.add('factor', 'one', 'bonus');
  b.multiply('reactionFactor', 'factor', 'reactionCoefficient');
  b.output('value', 'reactionFactor', q('scalar'));
  b.stage('reaction-em', 'emBonus', 'damage.reaction-em');
  b.stage('reaction-factor', 'reactionFactor', 'damage.reaction-factor');
  return b.finish();
}

export function additive(recipe: FormulaDefinition): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('em', q('elementalMastery'), {'required':true,'min':0});
  b.input('reactionBonus', q('scalar'), {'required':true});
  b.input('reactionCoefficient', q('scalar'), {'required':true,'min':0});
  b.input('levelMultiplier', q('damage'), {'required':true,'min':0});
  b.quantity('one', 'scalar', 1);
  b.quantity('emNumerator', 'scalar', standardReactionParameters.additive.emNumerator);
  b.quantity('emDenominator', 'elementalMastery', standardReactionParameters.additive.emDenominator);
  b.multiply('scaledEm', 'em', 'emNumerator');
  b.add('emDenominatorTotal', 'emDenominator', 'em');
  b.divide('emBonus', 'scaledEm', 'emDenominatorTotal');
  b.add('bonus', 'emBonus', 'reactionBonus');
  b.add('factor', 'one', 'bonus');
  b.multiply('reactionFactor', 'factor', 'reactionCoefficient');
  b.multiply('value', 'levelMultiplier', 'reactionFactor');
  b.output('value', 'value', q('damage'));
  b.stage('reaction-em', 'emBonus', 'damage.reaction-em');
  b.stage('reaction-factor', 'reactionFactor', 'damage.reaction-factor');
  return b.finish();
}

export function transformative(recipe: FormulaDefinition): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('flatBaseBonus', q('damage'), { required: false, default: { kind: 'quantity', unit: 'damage', value: 0 } });
  b.input('critFactor', q('scalar'), { required: false, min: 0, default: { kind: 'quantity', unit: 'scalar', value: 1 } });
  b.input('resistanceFactor', q('scalar'), {'required':true,'min':0});
  b.input('em', q('elementalMastery'), {'required':true,'min':0});
  b.input('reactionBonus', q('scalar'), {'required':true});
  b.input('reactionCoefficient', q('scalar'), {'required':true,'min':0});
  b.input('levelMultiplier', q('damage'), {'required':true,'min':0});
  b.quantity('one', 'scalar', 1);
  b.quantity('emNumerator', 'scalar', 16);
  b.quantity('emDenominator', 'elementalMastery', 2000);
  b.multiply('scaledEm', 'em', 'emNumerator');
  b.add('emDenominatorTotal', 'emDenominator', 'em');
  b.divide('emBonus', 'scaledEm', 'emDenominatorTotal');
  b.add('bonus', 'emBonus', 'reactionBonus');
  b.add('factor', 'one', 'bonus');
  b.multiply('reactionFactor', 'factor', 'reactionCoefficient');
  b.multiply('reactionBase', 'levelMultiplier', 'reactionFactor');
  b.add('withFlat', 'reactionBase', 'flatBaseBonus');
  b.multiply('beforeResistance', 'withFlat', 'critFactor');
  b.multiply('value', 'beforeResistance', 'resistanceFactor');
  b.output('value', 'value', q('damage'));
  b.stage('reaction-em', 'emBonus', 'damage.reaction-em');
  b.stage('reaction-factor', 'reactionFactor', 'damage.reaction-factor');
  b.stage('reaction-flat', 'flatBaseBonus', 'damage.reaction-flat');
  b.stage('crit', 'critFactor', 'damage.crit');
  b.stage('resistance', 'resistanceFactor', 'damage.resistance');
  return b.finish();
}

export function reactionMasteryBonus(recipe: FormulaDefinition): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('em', q('elementalMastery'), {'required':true,'min':0});
  b.quantity('numerator', 'scalar', 6);
  b.quantity('denominator', 'elementalMastery', 2000);
  b.multiply('scaledEm', 'em', 'numerator');
  b.add('totalDenominator', 'em', 'denominator');
  b.divide('value', 'scaledEm', 'totalDenominator');
  b.output('value', 'value', q('scalar'));
  b.stage('reaction-em', 'value', 'damage.reaction-em');
  return b.finish();
}

export function physicalReaction(recipe: FormulaDefinition, amplifying: DefinitionRef, additive: DefinitionRef): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('mode', {'kind':'enum','values':['none']}, {'required':true});
  b.input('em', q('elementalMastery'), {'required':true});
  b.input('levelMultiplier', q('damage'), {'required':true});
  b.input('amplifyingBonus', q('scalar'), {'required':true});
  b.input('additiveBonus', q('scalar'), {'required':true});
  b.constant('none', {'kind':'enum','value':'none'});
  b.compare('isNone', 'eq', 'mode', 'none');
  b.quantity('one', 'scalar', 1);
  b.quantity('zero', 'damage', 0);
  b.select('selected', 'isNone', 'one', 'one');
  b.output('multiplier', 'selected', q('scalar'));
  b.output('added', 'zero', q('damage'));
  return b.finish();
}

export function anemoReaction(recipe: FormulaDefinition, amplifying: DefinitionRef, additive: DefinitionRef): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('mode', {'kind':'enum','values':['none']}, {'required':true});
  b.input('em', q('elementalMastery'), {'required':true});
  b.input('levelMultiplier', q('damage'), {'required':true});
  b.input('amplifyingBonus', q('scalar'), {'required':true});
  b.input('additiveBonus', q('scalar'), {'required':true});
  b.constant('none', {'kind':'enum','value':'none'});
  b.compare('isNone', 'eq', 'mode', 'none');
  b.quantity('one', 'scalar', 1);
  b.quantity('zero', 'damage', 0);
  b.select('selected', 'isNone', 'one', 'one');
  b.output('multiplier', 'selected', q('scalar'));
  b.output('added', 'zero', q('damage'));
  return b.finish();
}

export function geoReaction(recipe: FormulaDefinition, amplifying: DefinitionRef, additive: DefinitionRef): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('mode', {'kind':'enum','values':['none']}, {'required':true});
  b.input('em', q('elementalMastery'), {'required':true});
  b.input('levelMultiplier', q('damage'), {'required':true});
  b.input('amplifyingBonus', q('scalar'), {'required':true});
  b.input('additiveBonus', q('scalar'), {'required':true});
  b.constant('none', {'kind':'enum','value':'none'});
  b.compare('isNone', 'eq', 'mode', 'none');
  b.quantity('one', 'scalar', 1);
  b.quantity('zero', 'damage', 0);
  b.select('selected', 'isNone', 'one', 'one');
  b.output('multiplier', 'selected', q('scalar'));
  b.output('added', 'zero', q('damage'));
  return b.finish();
}

export function hydroReaction(recipe: FormulaDefinition, amplifying: DefinitionRef, additive: DefinitionRef): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('mode', {'kind':'enum','values':['none','vaporize']}, {'required':true});
  b.input('em', q('elementalMastery'), {'required':true});
  b.input('levelMultiplier', q('damage'), {'required':true});
  b.input('amplifyingBonus', q('scalar'), {'required':true});
  b.input('additiveBonus', q('scalar'), {'required':true});
  b.constant('none', {'kind':'enum','value':'none'});
  b.compare('isNone', 'eq', 'mode', 'none');
  b.quantity('one', 'scalar', 1);
  b.quantity('zero', 'damage', 0);
  b.quantity('coefficient0', 'scalar', standardReactionParameters.amplifying.vaporize.hydro);
  b.call('reacted', amplifying, {'em':'em','reactionBonus':'amplifyingBonus','reactionCoefficient':'coefficient0'}, 'value');
  b.select('selected', 'isNone', 'one', 'reacted');
  b.output('multiplier', 'selected', q('scalar'));
  b.output('added', 'zero', q('damage'));
  return b.finish();
}

export function cryoReaction(recipe: FormulaDefinition, amplifying: DefinitionRef, additive: DefinitionRef): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('mode', {'kind':'enum','values':['none','melt']}, {'required':true});
  b.input('em', q('elementalMastery'), {'required':true});
  b.input('levelMultiplier', q('damage'), {'required':true});
  b.input('amplifyingBonus', q('scalar'), {'required':true});
  b.input('additiveBonus', q('scalar'), {'required':true});
  b.constant('none', {'kind':'enum','value':'none'});
  b.compare('isNone', 'eq', 'mode', 'none');
  b.quantity('one', 'scalar', 1);
  b.quantity('zero', 'damage', 0);
  b.quantity('coefficient0', 'scalar', standardReactionParameters.amplifying.melt.cryo);
  b.call('reacted', amplifying, {'em':'em','reactionBonus':'amplifyingBonus','reactionCoefficient':'coefficient0'}, 'value');
  b.select('selected', 'isNone', 'one', 'reacted');
  b.output('multiplier', 'selected', q('scalar'));
  b.output('added', 'zero', q('damage'));
  return b.finish();
}

export function electroReaction(recipe: FormulaDefinition, amplifying: DefinitionRef, additive: DefinitionRef): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('mode', {'kind':'enum','values':['none','aggravate']}, {'required':true});
  b.input('em', q('elementalMastery'), {'required':true});
  b.input('levelMultiplier', q('damage'), {'required':true});
  b.input('amplifyingBonus', q('scalar'), {'required':true});
  b.input('additiveBonus', q('scalar'), {'required':true});
  b.constant('none', {'kind':'enum','value':'none'});
  b.compare('isNone', 'eq', 'mode', 'none');
  b.quantity('one', 'scalar', 1);
  b.quantity('zero', 'damage', 0);
  b.quantity('coefficient0', 'scalar', standardReactionParameters.additive.aggravate);
  b.call('reacted', additive, {'em':'em','reactionBonus':'additiveBonus','reactionCoefficient':'coefficient0','levelMultiplier':'levelMultiplier'}, 'value');
  b.select('selected', 'isNone', 'zero', 'reacted');
  b.output('multiplier', 'one', q('scalar'));
  b.output('added', 'selected', q('damage'));
  return b.finish();
}

export function dendroReaction(recipe: FormulaDefinition, amplifying: DefinitionRef, additive: DefinitionRef): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('mode', {'kind':'enum','values':['none','spread']}, {'required':true});
  b.input('em', q('elementalMastery'), {'required':true});
  b.input('levelMultiplier', q('damage'), {'required':true});
  b.input('amplifyingBonus', q('scalar'), {'required':true});
  b.input('additiveBonus', q('scalar'), {'required':true});
  b.constant('none', {'kind':'enum','value':'none'});
  b.compare('isNone', 'eq', 'mode', 'none');
  b.quantity('one', 'scalar', 1);
  b.quantity('zero', 'damage', 0);
  b.quantity('coefficient0', 'scalar', standardReactionParameters.additive.spread);
  b.call('reacted', additive, {'em':'em','reactionBonus':'additiveBonus','reactionCoefficient':'coefficient0','levelMultiplier':'levelMultiplier'}, 'value');
  b.select('selected', 'isNone', 'zero', 'reacted');
  b.output('multiplier', 'one', q('scalar'));
  b.output('added', 'selected', q('damage'));
  return b.finish();
}

export function pyroReaction(recipe: FormulaDefinition, amplifying: DefinitionRef, additive: DefinitionRef): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input('mode', {'kind':'enum','values':['none','melt','vaporize']}, {'required':true});
  b.input('em', q('elementalMastery'), {'required':true});
  b.input('levelMultiplier', q('damage'), {'required':true});
  b.input('amplifyingBonus', q('scalar'), {'required':true});
  b.input('additiveBonus', q('scalar'), {'required':true});
  b.constant('none', {'kind':'enum','value':'none'});
  b.compare('isNone', 'eq', 'mode', 'none');
  b.quantity('one', 'scalar', 1);
  b.quantity('zero', 'damage', 0);
  b.quantity('coefficient0', 'scalar', standardReactionParameters.amplifying.melt.pyro);
  b.constant('firstMode', {'kind':'enum','value':'melt'});
  b.compare('isFirst', 'eq', 'mode', 'firstMode');
  b.quantity('coefficient1', 'scalar', standardReactionParameters.amplifying.vaporize.pyro);
  b.select('coefficient', 'isFirst', 'coefficient0', 'coefficient1');
  b.call('reacted', amplifying, {'em':'em','reactionBonus':'amplifyingBonus','reactionCoefficient':'coefficient'}, 'value');
  b.select('selected', 'isNone', 'one', 'reacted');
  b.output('multiplier', 'selected', q('scalar'));
  b.output('added', 'zero', q('damage'));
  return b.finish();
}

export function ordinaryReaction(recipe: FormulaDefinition, element: Element, amplifying?: DefinitionRef, additive?: DefinitionRef): FormulaGraph {
  const factories = { physical: physicalReaction, anemo: anemoReaction, geo: geoReaction, pyro: pyroReaction, hydro: hydroReaction, cryo: cryoReaction, electro: electroReaction, dendro: dendroReaction };
  return factories[element](recipe, amplifying!, additive!);
}

export function fixedReactionHit(recipe: FormulaDefinition, mastery: DefinitionRef, baseInput: string, coefficient: number, baseMultiplier = false): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input(baseInput, q('damage'), {'required':true,'min':0});
  b.input('reactionBaseBonus', q('scalar'), {'required':true});
  b.input('em', q('elementalMastery'), {'required':true,'min':0});
  b.input('reactionBonus', q('scalar'), {'required':true});
  b.input('flatBaseBonus', q('damage'), {'required':true});
  b.input('critFactor', q('scalar'), {'required':true,'min':0});
  b.input('resistanceFactor', q('scalar'), {'required':true,'min':0});
  b.input('elevationFactor', q('scalar'), {'required':true,'min':0});
  const scaledBase = baseMultiplier ? b.multiply('scaledSkillBase', baseInput, b.input('baseMultiplier', q('scalar'), { min: 0 })) : baseInput;
  b.quantity('one', 'scalar', 1);
  b.quantity('reactionCoefficient', 'scalar', coefficient);
  b.call('emBonus', mastery, { em: 'em' }, 'value');
  b.add('baseFactor', 'one', 'reactionBaseBonus');
  b.add('combinedReactionBonus', 'emBonus', 'reactionBonus');
  b.add('reactionFactor', 'one', 'combinedReactionBonus');
  b.multiply('reactionBase', scaledBase, 'reactionCoefficient');
  b.multiply('afterBaseBonus', 'reactionBase', 'baseFactor');
  b.multiply('afterReactionBonus', 'afterBaseBonus', 'reactionFactor');
  b.add('withFlat', 'afterReactionBonus', 'flatBaseBonus');
  b.multiply('afterCrit', 'withFlat', 'critFactor');
  b.multiply('afterResistance', 'afterCrit', 'resistanceFactor');
  b.multiply('value', 'afterResistance', 'elevationFactor');
  b.output('value', 'value', q('damage'));
  b.stage('reaction-base', 'reactionBase', 'damage.reaction-base');
  b.stage('reaction-base-factor', 'baseFactor', 'damage.reaction-base-factor');
  b.stage('reaction-em', 'emBonus', 'damage.reaction-em');
  b.stage('reaction-bonus', 'reactionFactor', 'damage.reaction-bonus');
  b.stage('reaction-flat', 'flatBaseBonus', 'damage.reaction-flat');
  b.stage('crit', 'critFactor', 'damage.crit');
  b.stage('resistance', 'resistanceFactor', 'damage.resistance');
  b.stage('elevation', 'elevationFactor', 'damage.elevation');
  return b.finish();
}

export function coefficientReactionHit(recipe: FormulaDefinition, mastery: DefinitionRef, baseInput: string, baseMultiplier = false): FormulaGraph {
  const b = new TemplateBuilder(recipe);
  b.input(baseInput, q('damage'), {'required':true,'min':0});
  b.input('reactionCoefficient', q('scalar'), {'required':true,'min':0});
  b.input('reactionBaseBonus', q('scalar'), {'required':true});
  b.input('em', q('elementalMastery'), {'required':true,'min':0});
  b.input('reactionBonus', q('scalar'), {'required':true});
  b.input('flatBaseBonus', q('damage'), {'required':true});
  b.input('critFactor', q('scalar'), {'required':true,'min':0});
  b.input('resistanceFactor', q('scalar'), {'required':true,'min':0});
  b.input('elevationFactor', q('scalar'), {'required':true,'min':0});
  const scaledBase = baseMultiplier ? b.multiply('scaledSkillBase', baseInput, b.input('baseMultiplier', q('scalar'), {
    required: false, default: { kind: 'quantity', unit: 'scalar', value: 1 }, min: 0,
  })) : baseInput;
  b.quantity('one', 'scalar', 1);
  b.call('emBonus', mastery, { em: 'em' }, 'value');
  b.add('baseFactor', 'one', 'reactionBaseBonus');
  b.add('combinedReactionBonus', 'emBonus', 'reactionBonus');
  b.add('reactionFactor', 'one', 'combinedReactionBonus');
  b.multiply('reactionBase', scaledBase, 'reactionCoefficient');
  b.multiply('afterBaseBonus', 'reactionBase', 'baseFactor');
  b.multiply('afterReactionBonus', 'afterBaseBonus', 'reactionFactor');
  b.add('withFlat', 'afterReactionBonus', 'flatBaseBonus');
  b.multiply('afterCrit', 'withFlat', 'critFactor');
  b.multiply('afterResistance', 'afterCrit', 'resistanceFactor');
  b.multiply('value', 'afterResistance', 'elevationFactor');
  b.output('value', 'value', q('damage'));
  b.stage('reaction-base', 'reactionBase', 'damage.reaction-base');
  b.stage('reaction-base-factor', 'baseFactor', 'damage.reaction-base-factor');
  b.stage('reaction-em', 'emBonus', 'damage.reaction-em');
  b.stage('reaction-bonus', 'reactionFactor', 'damage.reaction-bonus');
  b.stage('reaction-flat', 'flatBaseBonus', 'damage.reaction-flat');
  b.stage('crit', 'critFactor', 'damage.crit');
  b.stage('resistance', 'resistanceFactor', 'damage.resistance');
  b.stage('elevation', 'elevationFactor', 'damage.elevation');
  return b.finish();
}

export function reactionHit(recipe: FormulaDefinition, family: 'lunar-bloom' | 'lunar-charged' | 'lunar-crystallize' | 'stellar-conduct' | 'stellar-swirl', origin: 'direct' | 'individual', mastery: DefinitionRef, baseMultiplier = false): FormulaGraph {
  const base = origin === 'direct' ? 'scaledBase' : 'levelMultiplier';
  return family === 'stellar-conduct' || family === 'stellar-swirl' && origin === 'individual'
    ? coefficientReactionHit(recipe, mastery, base, baseMultiplier) : fixedReactionHit(recipe, mastery, base, directCoefficients[family], baseMultiplier);
}
