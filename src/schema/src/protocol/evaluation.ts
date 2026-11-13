import type { Project, Diagnostic } from '../project/project';
import type { QuantityUnit } from '../common/values';
import type { DamageResult } from './damage-result';
import type { CombatStateField } from '../project/combat-state';
type Definition = Project['definitions'][number];
export interface EffectInstance {
  id: string; owner: string; slot: string; definition: string; version: string; effect: string;
  action: string | null; startMs: number; endMs: number; recipient: string; attribute: string;
  unit: QuantityUnit; disabled: boolean;
}
export interface AttributeRead {
  id: string; actor: string; key: string; unit: QuantityUnit; timeMs: number;
  phase: 'before' | 'after'; recordId: string; instanceId?: string; value: number | null; dependencies: string[];
}
export interface DamagePoint {
  id: string;
  value: number | null;
  formula: { definition: string; root: string | null; effects: { definition: string; effect: string; action: string | null }[] };
  sources: { path: string; definition: string; version: string; source: Definition['source'] }[];
  real?: DamageResult;
}
export interface CombatStateRead {
  actor: string;
  field: CombatStateField;
  timeMs: number;
  recordId: string;
  value: number | boolean | null;
  source: 'interval' | 'override' | 'unknown';
  intervalId: string | null;
}
export interface EvaluationResult {
  status: 'complete' | 'partial' | 'invalid';
  points: DamagePoint[];
  objectiveValue: number | null;
  totalValue: number | null;
  diagnostics: Diagnostic[];
  plan: Project | null;
  effectInstances?: EffectInstance[];
  reads?: AttributeRead[];
  stateReads?: CombatStateRead[];
}

/** Pure v1 evaluation: each candidate rebuilds its effects; no simulation or shared run state. */
