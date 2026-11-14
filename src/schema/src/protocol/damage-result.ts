import type { StatKey } from '../content/stats';
import type { AttackType } from '../content/effects';
import type { DamageScalingStat } from '../content/talent';
import type { ContentSource } from '../common/values';
import type { Element } from '../content/stats';
import type { HitReactionType } from '../content/reactions';
export type CalculationStatus = 'complete' | 'partial' | 'invalid';
export interface CalculationIssue { code: 'unknown' | 'unsupported' | 'invalid-input'; message: string; affects?: { stat: StatKey; category?: AttackType }[] }
export interface Contribution { source: string; stat: StatKey; value: number; category?: AttackType }
export interface AttributePanel {
  status: CalculationStatus;
  stats: Record<StatKey, number>;
  contributions: Contribution[];
  categoryModifiers: Contribution[];
  baseStats?: { hp: number; attack: number; defense: number };
  diagnostics: string[];
  issues: CalculationIssue[];
}
export interface DamageResult {
  status: CalculationStatus;
  value: number | null;
  panel: AttributePanel;
  parts: { attack: number | null; multiplier: number | null; bonus: number | null; crit: number | null; defense: number | null; resistance: number | null };
  baseDamage: number | null;
  baseDamageBonus?: number | null;
  scaling: { stat: DamageScalingStat; parameter: string; attribute: number | null; multiplier: number | null; contribution: number | null; count?: { input: string; value: number | null } }[];
  capture?: { recordId: string | null; phase: 'before' | 'after' | null; attributes: StatKey[]; source: ContentSource };
  reaction?: {
    type: HitReactionType; family: 'amplifying' | 'additive'; trigger: 'record-owner' | null; element: Element;
    elementalMastery: number | null; bonus: number | null; coefficient: number | null; levelMultiplier: number | null;
    multiplier: number | null; addedBaseDamage: number | null; rulesRevision: string | null; sources: ContentSource[];
  };
  diagnostics: string[];
  issues: CalculationIssue[];
}
