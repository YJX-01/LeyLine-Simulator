import { combatFactDeclaration } from '../calculation/buffs.mjs';
import type { StructuredBuild } from '../account/structured-build';
import { z } from 'zod';
import type { CalculationFact } from '../calculation/binding';
import { valueMatchesType } from '../calculation/values';
import { talentInputIssues } from './talent';
import { idSchema } from '../common/values';
import { definitionKey, definitionRefSchema, type DefinitionRef } from '../calculation/values';
import type { StructuredCharacterDefinition } from './structured-content';

export const hitRefSchema = z.object({
  definition: definitionRefSchema.extend({ group: z.enum(['characters', 'weapons', 'sets']) }).strict(),
  hitId: idSchema,
}).strict();
export type HitRef = z.infer<typeof hitRefSchema>;

export function characterHitRef(character: DefinitionRef, hitId: string): HitRef {
  const { namespace, id, revision } = character;
  return { definition: { group: 'characters', namespace, id, revision }, hitId };
}

export function hitBelongsToCharacter(ref: HitRef, character: DefinitionRef): boolean {
  return ref.definition.group === 'characters' && definitionKey(character) === definitionKey(ref.definition);
}

export function findCharacterHit(character?: StructuredCharacterDefinition, ref?: HitRef) {
  if (!character || !ref || !hitBelongsToCharacter(ref, character)) return;
  for (const talent of character.talents) {
    const hit = talent.hits.find(hit => hit.id === ref.hitId);
    if (hit) return { talent, hit };
  }
}

export function hitEventFactIssues(entity: Pick<StructuredCharacterDefinition, 'metadata'> | NonNullable<StructuredBuild['weapon']> | StructuredBuild['sets'][number], talent: StructuredCharacterDefinition['talents'][number] | undefined,
  facts: Record<string, CalculationFact>, constellation: number, builds: Iterable<StructuredBuild> = []): string[] {
  const counts: Record<string, number | null> = {}, issues: string[] = [];
  for (const [key, fact] of Object.entries(facts)) {
    const input = talent?.inputs?.find(input => input.id === key);
    if (['targetsDamaged','criticalTargets'].includes(key) && fact.value?.kind === 'quantity'
      && (!Number.isSafeInteger(fact.value.value) || fact.value.value < 0 || fact.value.value > 1000)) issues.push('伤害目标数须为 0 到 1000 的整数。');
    if (key === 'triggerRoll' && fact.value?.kind === 'quantity' && (fact.value.value < 0 || fact.value.value >= 1)) issues.push('触发抽样值须在 [0,1) 内。');
    if (key === 'criticalTargets' && fact.value?.kind === 'quantity' && facts.targetsDamaged?.value?.kind === 'quantity'
      && fact.value.value > facts.targetsDamaged.value.value) issues.push('暴击目标数不能超过实际受到伤害的目标数。');
    let declaration = combatFactDeclaration(entity.metadata.facts, key);
    if (!input && (key === 'frostglow' || 'talents' in entity.metadata && entity.metadata.talents.some(skill => skill.inputs?.some(candidate => candidate.id === key)))) {
      issues.push('所选命中不使用此技能计数：' + key); continue;
    }
    if (key === 'stellarAttachments' && fact.value?.kind === 'quantity' && (!Number.isInteger(fact.value.value) || fact.value.value < 0 || fact.value.value > 12)) issues.push('极星辉域附着次数须为 0 到 12 的整数。');
    if (!declaration && !input) for (const build of builds) {
      for (const source of [build.character, build.weapon, ...build.sets]) {
        const field = source?.metadata.facts?.[key];
        if (field?.scope === 'query') declaration = field;
      }
    }
    if (input) counts[key] = fact.value === null ? null : fact.value.kind === 'quantity' && valueMatchesType(fact.value, input.type) ? fact.value.value : NaN;
    else if (declaration?.scope !== 'query' || fact.value && !valueMatchesType(fact.value, declaration.type)) issues.push('未声明或类型错误的本击事实：' + key);
  }
  return [...issues, ...talentInputIssues(talent ?? {}, counts, constellation)];
}

export function buildSetCounts(build: Pick<StructuredBuild, 'artifacts' | 'theoreticalSetSlots'>): Record<string, number> {
  const counts: Record<string, number> = Object.create(null);
  for (const item of [...build.artifacts, ...build.theoreticalSetSlots ?? []]) counts[item.setId] = (counts[item.setId] ?? 0) + 1;
  return counts;
}

export function equipmentHits(build: StructuredBuild) {
  const counts = buildSetCounts(build);
  return [build.weapon, ...build.sets].flatMap(entity => {
    if (!entity) return [];
    const group = entity.kind === 'weapon-definition' ? 'weapons' as const : 'sets' as const;
    const hits = entity.kind === 'weapon-definition' ? entity.hits ?? [] : entity.effects.flatMap(piece => (counts[entity.id] ?? 0) >= piece.pieces ? piece.hits ?? [] : []);
    const { id, namespace, revision } = entity;
    return hits.map(hit => ({ entity, hit, ref: { definition: { group, namespace, id, revision }, hitId: hit.id } }));
  });
}
export function findBuildHit(build?: StructuredBuild, ref?: HitRef) {
  if (!build || !ref) return;
  const character = findCharacterHit(build.character, ref);
  if (character) return { ...character, entity: build.character };
  const equipment = equipmentHits(build).find(item => item.ref.definition.group === ref.definition.group && definitionKey(item.entity) === definitionKey(ref.definition) && item.hit.id === ref.hitId);
  if (equipment) return { hit: equipment.hit, entity: equipment.entity, talent: undefined };
}
