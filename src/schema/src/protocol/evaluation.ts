import type { Project, Diagnostic } from '../project/project';
import type { QuantityUnit } from '../common/values';
import type { DamageResult } from './damage-result';
import type { CombatStateField } from '../project/combat-state';
type Definition = Project['definitions'][number];
export interface EffectInstance {
  id: string; owner: string; slot: string; definition: string; version: string; effect: string;
  action: string | null; startMs: number; endMs: number; possibleEndMs?: number; recipient: string; attribute: string;
  unit: QuantityUnit; disabled: boolean;
  modifiers?: { definition: string; attribute: string; unit: QuantityUnit }[];
  content?: { entity: string; rule: string };
  permanent?: true;
  unconfirmed?: true;
  requiresApplication?: true;
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
  source: 'interval' | 'override' | 'switch' | 'unknown';
  intervalId: string | null;
  sourceEventId?: string;
}
export interface EvaluationResult {
  status: 'complete' | 'partial' | 'invalid';
  points: DamagePoint[];
  objectiveValue: number | null;
  totalValue: number | null;
  objectiveKnownSubtotal?: number;
  knownSubtotal?: number;
  diagnostics: Diagnostic[];
  plan: Project | null;
  effectInstances?: EffectInstance[];
  reads?: AttributeRead[];
  stateReads?: CombatStateRead[];
  combatChanges?: CombatChange[];
  feasibility?: import('../calculation/result').CalculationFeasibility[];
  actionStateRuns?: { actorId: string; status: import('../calculation/result').FormulaEvaluation['execution'];
    diagnostics: import('../calculation/diagnostic').CalculationDiagnostic[]; requiredInputs: import('../calculation/result').RequiredInput[] }[];
}

export interface CombatChange {
  source: string; actor: string; effect: string; timeMs: number; kind: 'clear-particles' | 'elemental-particles' | 'reset-skill' | 'particle-energy' | 'passive-energy' | 'skill-charge' | 'burst-energy' | 'burst-cooldown' | 'aura-duration' | 'talent-healing';
  healing?: number; sourceEventIds?: string[];
  particleElement?: import('../content/stats').Element;
  durationMs?: number;
  status: 'applied' | 'excluded' | 'unknown'; probability?: number; nextTriggerMs?: number; missing?: string[];
  particles?: number; energyGain?: number; energyAfter?: number; cooldownAfterMs?: number; recipient?: string; chargesAfter?:number; ticks?:number;
}

/** Pure v1 evaluation: each candidate rebuilds its effects; no simulation or shared run state. */
