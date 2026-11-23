import { z } from 'zod';
import { idSchema } from '../common/values';
import { calculationFactSchema, type CalculationFact } from '../calculation/binding';
import { combatConditionsSchema, type CombatConditions } from './combat-conditions';
import type { Value } from '../calculation/values';

const subject = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('actor'), id: idSchema }).strict(),
  z.object({ kind: z.literal('target'), id: idSchema }).strict(),
  z.object({ kind: z.literal('team') }).strict(),
  z.object({ kind: z.literal('event') }).strict(),
]);
export const hitFactsSchema = z.array(z.object({ subject, values: z.record(idSchema, calculationFactSchema) }).strict()).max(100).superRefine((rows, validation) => {
  const seen = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const key = JSON.stringify(row.subject);
    if (seen.has(key)) validation.addIssue({ code: 'custom', path: [index, 'subject'], message: '同一主体的命中事实重复。' });
    seen.add(key);
    for (const [field, fact] of Object.entries(row.values)) {
      if (['sigewinne.partyBondOfLife', 'chrysosShieldDamage', 'recoveryOrbBaseHealing', 'recoveryOrbBaseStamina'].includes(field)) {
        const unit = field === 'recoveryOrbBaseStamina' ? 'stamina' : 'hp';
        const scope = field === 'sigewinne.partyBondOfLife' ? 'team' : 'event';
        if (row.subject.kind !== scope || fact.value && (fact.value.kind !== 'quantity' || fact.value.unit !== unit || fact.value.value < 0)) {
          validation.addIssue({ code: 'custom', path: [index, 'values', field], message: '恢复基数或队伍总量的主体、单位或取值无效。' });
        }
      }
      if (['currentEnergy','skillCooldownRemaining','nearbyEnemies','deathmatch.enemiesAtUpdate'].includes(field)) {
        const unit = field === 'currentEnergy' ? 'energy' : field === 'skillCooldownRemaining' ? 'milliseconds' : 'count';
        if (row.subject.kind !== 'actor' || fact.value && (fact.value.kind !== 'quantity' || fact.value.unit !== unit || fact.value.value < 0 || unit !== 'energy' && !Number.isSafeInteger(fact.value.value))) {
          validation.addIssue({ code:'custom', path:[index,'values',field], message:'队员事实的单位或取值无效。' });
        }
      }
      if (field !== 'onField' && field !== 'shielded' && field !== 'hpRatio') continue;
      if (row.subject.kind !== 'actor' || fact.value && (field === 'hpRatio' ? fact.value.kind !== 'quantity' || fact.value.unit !== 'scalar' : fact.value.kind !== 'boolean')
        || !combatConditionsSchema.safeParse({ [field]: fact.value?.value ?? null }).success) {
        validation.addIssue({ code: 'custom', path: [index, 'values', field], message: '状态事实的主体、类型或取值无效。' });
      }
    }
  }
});
export type HitFacts = z.infer<typeof hitFactsSchema>;
export type FactSubject = HitFacts[number]['subject'];

export function subjectFacts(rows: HitFacts | undefined, subject: FactSubject) {
  return rows?.find(row => row.subject.kind === subject.kind && (!('id' in subject) || 'id' in row.subject && row.subject.id === subject.id))?.values;
}
export function putHitFact(rows: HitFacts, subject: FactSubject, key: string, value: Value | null, provenance: CalculationFact['provenance'] = 'explicit') {
  const fact: CalculationFact = { value, sourceRefs: [], provenance };
  const values = subjectFacts(rows, subject);
  if (values) values[key] = fact;
  else rows.push({ subject, values: { [key]: fact } });
}
export function actorConditions(rows: HitFacts | undefined, actor: string): CombatConditions {
  const facts = subjectFacts(rows, { kind: 'actor', id: actor });
  return Object.fromEntries(['onField', 'hpRatio', 'shielded'].filter(key => facts && Object.hasOwn(facts, key))
    .map(key => [key, facts![key].value?.value ?? null]));
}
