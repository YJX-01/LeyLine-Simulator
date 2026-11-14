import { buildSchema, combatConditionsSchema, damageRequestSchema, enemySchema, statKeys,
  type AttributePanel, type Build, type CalculationIssue, type CombatConditions, type DamageRequest, type DamageResult, type Diagnostic, type Enemy, type Project } from '@leyline/schema';
import { resolveStaticBuild } from './build';
import { evaluateDamage as evaluateDamageFormula, type DamageAttributeReader, type DamageCaptureContext } from './damage';
import { evaluateDependencyGraph } from '../effects/graph';
import { hasCombatRules } from '../effects/content-rules';

/** An internal query context, never a generated player project or combat sequence. */
function queryProject(build: Build, damage?: DamageRequest, enemy?: Enemy) {
  const project: Project = { schemaVersion: 2, rulesVersion: 'timeline-v1', calculationProfile: 'dependency', id: 'attribute-query', revision: '1',
    definitions: ['character', 'weapon', 'damage'].map(id => ({ id, version: build.dataVersion,
      source: { kind: build.character.origin === 'builtin' ? 'preset' : 'user', reference: build.dataVersion, verified: false },
      nodes: id === 'damage' ? [{ id: 'damage', op: 'game-damage' as const }] : [], effects: [], ...(id === 'damage' ? { damage: 'damage' } : {}) })),
    candidate: { id: 'query', actors: [{ id: 'owner', character: 'character', weapon: 'weapon', inputs: {}, build }] },
    conditions: {}, timeline: [], objective: {}, ...(enemy ? { enemy } : {}) };
  const record: Project['timeline'][number] = { id: 'query', timeMs: 0, order: 0, actor: 'owner', kind: 'damage', definition: 'damage', ...(damage ? { damage } : {}) };
  return { project, record };
}

function issueFrom(diagnostic: Diagnostic): CalculationIssue {
  return { code: diagnostic.code === 'unknown' || diagnostic.code === 'unsupported' ? diagnostic.code
    : diagnostic.code === 'budget' || diagnostic.code === 'stale-revision' ? 'unknown' : 'invalid-input', message: diagnostic.message };
}
function mergeIssues(issues: CalculationIssue[], diagnostics: Diagnostic[]) {
  for (const diagnostic of diagnostics) {
    const issue = issueFrom(diagnostic);
    if (!issues.some(existing => existing.code === issue.code && existing.message === issue.message)) issues.push(issue);
  }
}

/** A standalone panel resolves permanent content rules through the same graph as timeline damage. */
export function resolveBuild(input: unknown, conditions: CombatConditions = {}): AttributePanel {
  const panel = resolveStaticBuild(input, conditions);
  const build = buildSchema.safeParse(input);
  if (!build.success || !combatConditionsSchema.safeParse(conditions).success || !hasCombatRules(build.data)) return panel;
  const { project, record } = queryProject(build.data);
  record.damage = { skillId: 'unselected', hitIndex: 0, crit: null, reaction: null, conditions };
  const result = evaluateDependencyGraph(project, { attributeQuery: { actor: 'owner', record, stats: statKeys } });
  for (const stat of statKeys) {
    const value = result.attributes?.[stat];
    if (value === null || value === undefined) continue;
    if (value !== panel.stats[stat]) panel.contributions.push({ source: '内容规则依赖求值', stat, value: value - panel.stats[stat] });
    panel.stats[stat] = value;
  }
  mergeIssues(panel.issues, result.diagnostics);
  panel.status = panel.issues.some(issue => issue.code === 'invalid-input') ? 'invalid' : panel.issues.length ? 'partial' : 'complete';
  panel.diagnostics = panel.issues.map(issue => issue.message);
  return panel;
}

/** Public direct queries and projects share content assembly and attribute evaluation. */
export function evaluateDamage(input: unknown, damage: DamageRequest | undefined, enemy: Enemy | undefined, extraBonus = 0, reader?: DamageAttributeReader, captureContext?: DamageCaptureContext): DamageResult {
  const build = buildSchema.safeParse(input);
  if (reader || captureContext || damage?.capture || !build.success || !hasCombatRules(build.data) || !damageRequestSchema.safeParse(damage).success
    || damage?.stateOverrides?.length || damage?.effectApplications?.length || (enemy !== undefined && !enemySchema.safeParse(enemy).success)) {
    return evaluateDamageFormula(input, damage, enemy, extraBonus, reader, captureContext);
  }
  const { project, record } = queryProject(build.data, damage, enemy);
  project.timeline.push(record);
  const graph = evaluateDependencyGraph(project, { extraBonus });
  const result = graph.points[0]?.real ?? evaluateDamageFormula(input, damage, enemy, extraBonus);
  mergeIssues(result.issues, graph.diagnostics);
  result.status = result.issues.some(issue => issue.code === 'invalid-input') ? 'invalid' : result.issues.length ? 'partial' : 'complete';
  if (result.status !== 'complete') result.value = null;
  result.diagnostics = result.issues.map(issue => issue.message);
  return result;
}
