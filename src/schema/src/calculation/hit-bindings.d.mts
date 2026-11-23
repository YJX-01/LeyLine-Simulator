import type { CharacterMetadata } from '../content/character-metadata';
import type { BoundFormula, CalculationBinding } from './binding';
import type { StructuredCharacterDefinition } from '../content/structured-content';
import type { Value } from './values';
import type { PartyInfusionElement } from './party-infusion.mjs';

type Talent = StructuredCharacterDefinition['talents'][number];
type Hit = Talent['hits'][number];
type AuthoredHit = CharacterMetadata['talents'][number]['hits'][number];
export function authoredHitEntries(metadata: CharacterMetadata, skillId: string): {
  hit: AuthoredHit; field: string; unlock?: { state: 'constellation' | 'ascension'; rank: number };
}[];
export function authoredHit(metadata?: CharacterMetadata, skillId?: string, hitId?: string): AuthoredHit | undefined;
export const absorbedElements: ('pyro' | 'hydro' | 'electro' | 'cryo')[];
export function ordinaryReactions(element?: string): readonly ('melt' | 'vaporize' | 'aggravate' | 'spread')[];
export function partyPriorityElement(elements: Iterable<string | undefined | null>): Hit['element'] | null;
export function resolveHitElement(hit: Pick<Hit, 'element' | 'elementBy' | 'infusion'>, value?: Value | null, team?: Iterable<string | undefined | null>, infused?: boolean | null, partyInfused?: PartyInfusionElement): { element: Hit['element']; missing?: 'strikingHand' | 'partyPriorityElement' };
export function effectiveHitElement(hit: Pick<Hit, 'element' | 'elementBy' | 'infusion'>, value?: Value | null, team?: Iterable<string | undefined | null>, infused?: boolean | null, partyInfused?: PartyInfusionElement): Hit['element'];
export function hitInvocations(hit: Pick<Hit, 'base' | 'element' | 'elementBy' | 'coordinated' | 'infusion' | 'damage' | 'origin'> & { category: Hit['category'] | null }, weaponType?: string): BoundFormula[];
export function ordinaryHitInvocation(hit: Pick<Hit, 'element' | 'base'> & Partial<Pick<Hit, 'damage'>>, predicate?: CalculationBinding, withElevation?: boolean): BoundFormula;
export function combatDamageBindings(element: Hit['element'], captures?: BoundFormula['captures']): {
  attr: (stat: string) => CalculationBinding;
  target: (stat: string) => CalculationBinding;
  call: (formula: string, inputs: Record<string, CalculationBinding>, output?: string) => CalculationBinding;
  mode: (key: string, values: string[]) => CalculationBinding;
  critFactor: CalculationBinding;
  resistanceFactor: CalculationBinding;
};
export function hitBindings(hit: Pick<Hit, 'element' | 'base'>): ReturnType<typeof combatDamageBindings> & { skillBase: CalculationBinding };
