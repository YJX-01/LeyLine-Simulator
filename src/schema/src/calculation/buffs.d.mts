import type { DefinitionRef } from './values';
import type { EffectDefinition } from './effect';

export function grantBuffs(owner: object, effects: EffectDefinition[], sources: string[], facts: object, unlock?: object, talent?: object, talents?: readonly object[]): DefinitionRef[];

type FactDeclaration = Omit<Extract<import('./binding').CalculationBinding, { kind: 'fact' }>, 'kind' | 'key'>;
export const commonCombatFacts: Readonly<Record<string, FactDeclaration>>;
export function combatFactDeclaration(facts: Record<string, FactDeclaration> | undefined, key: string): FactDeclaration | undefined;
export function expression(value: import('../content/combat-expression').CombatExpression, facts?: Record<string, FactDeclaration>): import('./binding').CalculationBinding;
export function conditionFactInputs(value: import('../content/combat-expression').CombatExpression | undefined, facts?: Record<string, FactDeclaration>):
  { key: string; scope: FactDeclaration['scope']; type: FactDeclaration['type'] }[];
