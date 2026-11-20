import type { BoundFormula, CalculationBinding } from './binding';
import type { StructuredCharacterDefinition } from '../content/calculation';

type Talent = StructuredCharacterDefinition['talents'][number];
type Hit = Talent['hits'][number];
export function ordinaryTrialId(hitId: string): string;
export function canTryOrdinaryHit(talent: { noIndependentDamage?: true; details: { label: string; template: string }[] }, hit: { base: BoundFormula; outputs: readonly unknown[]; parameter?: string }): boolean;
export function ordinaryHitInvocation(hit: Pick<Hit, 'element' | 'base'>, predicate?: CalculationBinding): BoundFormula;
export function combatDamageBindings(element: Hit['element'], captures?: BoundFormula['captures']): {
  attr: (stat: string) => CalculationBinding;
  target: (stat: string) => CalculationBinding;
  call: (formula: string, inputs: Record<string, CalculationBinding>, output?: string) => CalculationBinding;
  mode: (key: string, values: string[]) => CalculationBinding;
  critFactor: CalculationBinding;
  resistanceFactor: CalculationBinding;
};
export function hitBindings(hit: Pick<Hit, 'element' | 'base'>): ReturnType<typeof combatDamageBindings> & { skillBase: CalculationBinding };
