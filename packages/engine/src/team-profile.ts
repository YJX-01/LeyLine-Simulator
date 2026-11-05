import type { RuntimeHit } from './combat-runtime';
import { content, type CharacterKey } from '@leyline/game-data';
import type { ResolvedLoadout } from './loadout';

export const frames = (value: number) => Math.round(value / 60 * 1000);
export const layouts: Record<CharacterKey, number[][]> = {
  jean: [[0], [1], [2], [3], [4]], xingqiu: [[0], [1], [2, 3], [4], [5, 6]],
  hutao: [[0], [1], [2], [3], [4, 5], [6]], albedo: [[0], [1], [2], [3], [4]], raiden: [[0], [1], [2], [3, 4], [5]],
};
export const normalTiming: Record<CharacterKey, { hits: number[][]; locks: number[] }> = {
  jean: { hits: [[13], [6], [17], [37], [25]], locks: [28, 20, 36, 52, 80] },
  xingqiu: { hits: [[10], [13], [9, 19], [17], [18, 39]], locks: [24, 30, 41, 36, 86] },
  hutao: { hits: [[12], [9], [17], [22], [16, 28], [23]], locks: [19, 17, 31, 35, 43, 79] },
  albedo: { hits: [[12], [11], [17], [17], [27]], locks: [20, 28, 40, 44, 74] },
  raiden: { hits: [[14], [9], [14], [14, 27], [34]], locks: [24, 19, 32, 41, 56] },
};
export const burstNormalTiming = { hits: [[12], [13], [11], [22, 33], [33]], locks: [25, 22, 22, 44, 65] };
export const namedTiming: Record<CharacterKey, Record<string, { hit: number; lock: number; cd: number }>> = {
  jean: { E: { hit: 21, lock: 46, cd: 19 }, Q: { hit: 40, lock: 88, cd: 38 }, C: { hit: 36, lock: 56, cd: 0 } },
  xingqiu: { E: { hit: 12, lock: 77, cd: 10 }, Q: { hit: 18, lock: 40, cd: 0 }, C: { hit: 8, lock: 58, cd: 0 } },
  hutao: { E: { hit: 0, lock: 28, cd: 14 }, Q: { hit: 66, lock: 97, cd: 62 }, C: { hit: 23, lock: 61, cd: 0 } },
  albedo: { E: { hit: 25, lock: 32, cd: 23 }, Q: { hit: 75, lock: 96, cd: 74 }, C: { hit: 20, lock: 56, cd: 0 } },
  raiden: { E: { hit: 51, lock: 51, cd: 6 }, Q: { hit: 98, lock: 111, cd: 0 }, C: { hit: 22, lock: 41, cd: 0 } },
};
export const hit = (element: RuntimeHit['element'], multiplier: number, category: RuntimeHit['category'], gauge: 0 | 1 | 2 = 0, tag = category ?? 'hit'): RuntimeHit =>
  ({ element, multiplier, category, gauge, icdTag: tag, icdRule: gauge ? 'standard' : 'none' });

export const talentScalers = (actor: ResolvedLoadout, key: 'A' | 'E' | 'Q') =>
  content.characters[actor.loadout.character].skills[key][String(actor.talents[key === 'A' ? 'normal' : key === 'E' ? 'skill' : 'burst'])];
