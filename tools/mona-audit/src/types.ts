export type AuditSide = 'mona' | 'leyline';
export type AuditCategory = 'damage' | 'buff' | 'unknown';
export type EntityKind = 'character' | 'weapon' | 'set' | 'reaction' | 'resonance' | 'other';
export type AttributionStatus = 'open' | 'attributed-scoped' | 'attributed';
export type AuditView = 'overview' | 'entities' | 'behaviors' | 'inventory';

export interface AuditRow {
  id: string;
  side: AuditSide | string;
  category: AuditCategory | string;
  name: string;
  entity: string;
  entityKey?: string;
  entityName?: string;
  entityKind?: EntityKind;
  element?: string;
  mechanism: string;
  run: string;
  comparison: string;
  implementation: string;
  chunk: string;
  featureText: string;
  roles?: string[];
  counterpartIds?: string[];
  attributionStatus?: AttributionStatus;
  attributionCauses?: string[];
}

export interface SideSummary {
  raw: number;
  rows: number;
  damage: number;
  buff: number;
  unknown: number;
  passed: number;
  failed: number;
  unverified: number;
  comparable: number;
  matched: number;
  different: number;
}

export interface GroupSummary {
  total: number;
  comparable?: number;
  matched: number;
  different: number;
  other?: number;
  scope?: string;
}

export interface AuditIssue {
  issue?: string;
  message?: string;
  id?: string;
  [key: string]: unknown;
}

export interface AuditSummary {
  sides: Record<string, SideSummary>;
  mappings: GroupSummary;
  comparisons: GroupSummary;
  scenarios: { total: number };
  direct: GroupSummary;
  issues: AuditIssue[];
  limitations: string[];
  delta: Record<string, Record<string, number>> | null;
  attributedMappings: number;
  attributedScopedMappings?: number;
  attributedScenarios: number;
}

export interface SweepModeSummary {
  mode: string;
  label: string;
  matched: number;
  total: number;
  suspect: number;
  knownArtifact: number;
  zeroOnLeyline?: number;
  unknown?: number;
  skipped?: number;
  elapsedMs?: number;
}

export interface SweepSummary {
  generatedAt: string;
  modes: SweepModeSummary[];
  totals: {
    modes: number;
    matched: number;
    total: number;
    suspect: number;
    knownArtifact: number;
  };
}

export interface BehaviorCounts {
  total: number;
  opening: number;
  discovered: number;
  closed: number;
  reopened: number;
  ending: number;
}

export interface BehaviorBatch {
  facet: string;
  behaviors: number;
  rows: number;
  blockers: Record<string, number>;
  totals?: Record<string, BehaviorCounts>;
}

export interface ProductChange {
  id?: string;
  rowId: string;
  name: string;
  source?: string;
}

export interface BehaviorCoverage {
  file: string;
  baselineFile?: string;
  reportDigest?: string;
  totals: Record<string, BehaviorCounts>;
  complete?: boolean;
  batches: BehaviorBatch[];
  owners?: Record<string, number>;
  facets: Record<string, string>;
  gaps: Record<string, string>;
  baseline: { mona?: string; leyline?: string; worktree?: string | null } | null;
  productChanges: ProductChange[];
}

export interface BehaviorRecord {
  id: string;
  rowId: string;
  side: string;
  category: string;
  facet: string;
  gaps: string[];
  transition: string;
  source: string;
  reason?: string;
}

export interface AuditIndex {
  versions: { mona?: string | null; leyline?: string | null };
  generatedAt: string;
  dirty: boolean | null;
  worktree?: string;
  summary: AuditSummary;
  coverage?: BehaviorCoverage;
  sweep?: SweepSummary | null;
  rows: AuditRow[];
}

export interface ReferenceItem {
  id: string;
  name: string;
  side: string;
}

export interface AttributionItem {
  id: string;
  cause: string;
  status: AttributionStatus | string;
  scope?: string;
  proof?: string;
  evidence?: string[];
  explanation?: string;
}

export interface AssignmentItem {
  id: string;
  role?: string;
  reason?: string;
  owner?: string;
  categories?: string[];
}

export interface NumericPair {
  scenario?: string;
  input?: string;
  name?: string;
  mona?: number;
  leyline?: number;
  difference?: number;
  tolerance?: number;
  result?: string;
  method?: string;
}

export interface FormulaComparison {
  linkId?: string;
  input?: string;
  scenario?: string;
  name?: string;
  expected?: number;
  actual?: number;
  mona?: number;
  leyline?: number;
  difference?: number | null;
  delta?: number | null;
  tolerance?: number;
  result?: string;
}

export interface BuffSideReading {
  before?: number;
  enabled?: number;
  disabled?: number;
  disabledCondition?: string;
}

export interface BuffReading {
  source?: string;
  recipient?: string;
  attribute?: string;
  monaBaseStat?: number;
  mona?: BuffSideReading;
  leyline?: BuffSideReading;
}

export interface AuditDetail {
  features?: Record<string, unknown>;
  source?: string;
  sourceIds?: string[];
  raw?: unknown[];
  links?: Record<string, unknown>[];
  candidates?: Record<string, unknown>[];
  counterparts?: ReferenceItem[];
  candidateRows?: ReferenceItem[];
  attribution?: AttributionItem[];
  assignments?: AssignmentItem[];
  details?: {
    pairs?: NumericPair[];
    comparisons?: FormulaComparison[];
    probes?: Record<string, unknown>[];
    batches?: { batch: string; record: Record<string, unknown> }[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface EntitySummary {
  key: string;
  name: string;
  kind: EntityKind;
  element?: string;
  total: number;
  monaCount: number;
  leylineCount: number;
  matched: number;
  different: number;
  openDiff: number;
  attributedDiff: number;
  pending: number;
  unmapped: number;
  exclusive: number;
  comparable: number;
  passed: number;
  failed: number;
  rows: AuditRow[];
}

export interface InventoryFilters {
  q: string;
  side: string;
  category: string;
  comparison: string;
  run: string;
  mechanism: string;
  role: string;
  attr: string;
  cause: string;
  entity: string;
}
