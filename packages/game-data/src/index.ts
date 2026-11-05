export interface SkillDefinition {
  readonly id: string;
  readonly name: string;
  readonly element: 'anemo';
  readonly hitDelayMs: number;
  readonly actionLockMs: number;
  readonly cooldownMs: number;
  readonly cooldownStartDelayMs: number;
  readonly multipliers: readonly number[];
}

/** Repository snapshot only; see docs/mechanics/jean-tap.md for conflicts and scope. */
const jeanTap = {
  id: 'jean.e.tap', name: '琴 · 风压剑（点按）', element: 'anemo',
  hitDelayMs: 767, actionLockMs: 767, cooldownMs: 6000, cooldownStartDelayMs: 300,
  multipliers: [2.9200000762939453, 3.1389999389648438, 3.3580000400543213,
    3.6500000953674316, 3.86899995803833, 4.0879998207092285,
    4.380000114440918, 4.671999931335449, 4.964000225067139, 5.25600004196167],
} as const satisfies SkillDefinition;

export const skillRegistry = { 'jean.e.tap': jeanTap } as const;
export type SkillId = keyof typeof skillRegistry;
export const GAME_DATA_VERSION = 'repo-jean-tap-v1';
