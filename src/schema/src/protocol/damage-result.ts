import type { StatKey } from '../content/stats';
export type CalculationStatus = 'complete' | 'partial' | 'invalid';
export interface CalculationIssue { code: 'unknown' | 'unsupported' | 'invalid-input'; message: string }
export interface Contribution { source: string; stat: StatKey; value: number; category?: 'normal' | 'skill' | 'burst' }
export interface AttributePanel {
  status: CalculationStatus;
  stats: Record<StatKey, number>;
  contributions: Contribution[];
  categoryModifiers: Contribution[];
  diagnostics: string[];
  issues: CalculationIssue[];
}
export interface DamageResult {
  status: CalculationStatus;
  value: number | null;
  panel: AttributePanel;
  parts: { attack: number | null; multiplier: number | null; bonus: number | null; crit: number | null; defense: number | null; resistance: number | null };
  diagnostics: string[];
  issues: CalculationIssue[];
}
