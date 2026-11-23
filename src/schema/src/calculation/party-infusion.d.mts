import type { StructuredBuild } from '../account/structured-build';
import type { StructuredCharacterDefinition } from '../content/structured-content';
import type { Value } from './values';

export const partyInfusionFact: 'partyInfusion';
export const partyInfusionElements: readonly ['pyro', 'hydro', 'cryo'];
export type PartyInfusionElement = typeof partyInfusionElements[number];
type TalentHit = StructuredCharacterDefinition['talents'][number]['hits'][number];
type Hit = Pick<TalentHit, 'element' | 'origin' | 'damage' | 'elementBy' | 'coordinated' | 'infusion'> & { category: TalentHit['category'] | null };
type GrantingBuild = Pick<StructuredBuild, 'character' | 'constellation'>;
export function partyInfusionHit(hit: Hit, weaponType?: string): boolean;
export function partyInfusionOptions(hit: Hit, weaponType: string | undefined, builds: Iterable<GrantingBuild>, infused?: boolean | null): Map<PartyInfusionElement, string[]>;
export function selectedPartyInfusion(hit: Hit, weaponType: string | undefined, builds: Iterable<GrantingBuild>, selected?: Value | null, infused?: boolean | null): PartyInfusionElement | undefined;
