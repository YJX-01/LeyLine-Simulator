import { z } from 'zod';

const nonnegative = z.number().finite().min(0).max(1e9);
export const attackSchema = z.object({
  schemaVersion: z.literal(1),
  attack: nonnegative,
  multiplier: nonnegative,
  damageBonus: nonnegative,
  critRate: z.number().finite().min(0).max(1),
  critDamage: nonnegative,
  mode: z.enum(['expected', 'critical', 'noncritical']),
}).strict();
export type AttackInput = z.infer<typeof attackSchema>;
export interface AttackResult {
  versions: { schema: 1; engine: string; rules: string; data: string };
  baseDamage: number;
  bonusMultiplier: number;
  critMultiplier: number;
  damage: number;
}
export type WorkerRequest = { id: number; input: AttackInput };
export type WorkerResponse = { id: number } & (
  { ok: true; result: AttackResult } | { ok: false; error: string }
);
