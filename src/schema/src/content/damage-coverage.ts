import { definitionKey } from '../calculation/values';
import type { CharacterDefinition } from './character';
import type { DamageRequest } from '../project/damage';
export function findDamageCoverage(character: CharacterDefinition, constellation: number, damage?: Pick<DamageRequest, 'skillId' | 'hitId'>) {
  if (!damage) return undefined;
  return character.calculation.bundle.coverage.find(record => definitionKey(record.entity) === definitionKey(character) && record.resolution === 'complete'
    && record.scope.kind === 'hit' && record.scope.skillId === damage.skillId && record.scope.hitId === damage.hitId && constellation <= record.scope.maxConstellation);
}
