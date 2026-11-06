import { workbenchProjectSchema, type WorkbenchProject, type WorkbenchDiagnostic, type WorkbenchUnit } from '@leyline/schema';
import { evaluateRealDamage, type RealDamageResult } from '../real-game';

type Definition = WorkbenchProject['definitions'][number];
type Quantity = { value: number; unit: WorkbenchUnit };
export interface WorkbenchPoint {
  id: string;
  value: number | null;
  formula: { definition: string; root: string | null; effects: { definition: string; effect: string; action: string | null }[] };
  sources: { path: string; definition: string; version: string; source: Definition['source'] }[];
  real?: RealDamageResult;
}
export interface WorkbenchResult {
  status: 'complete' | 'partial' | 'invalid';
  points: WorkbenchPoint[];
  objectiveValue: number | null;
  totalValue: number | null;
  diagnostics: WorkbenchDiagnostic[];
  plan: WorkbenchProject | null;
}

/** Pure v1 evaluation: each candidate rebuilds its effects; no simulation or shared run state. */
export function evaluateWorkbench(input: unknown): WorkbenchResult {
  const diagnostics: WorkbenchDiagnostic[] = [];
  const report = (code: WorkbenchDiagnostic['code'], path: string, message: string) => {
    if (!diagnostics.some(d => d.code === code && d.path === path && d.message === message)) diagnostics.push({ code, path, message });
  };
  const parsed = workbenchProjectSchema.safeParse(input);
  if (!parsed.success) return {
    status: 'invalid', points: [], objectiveValue: null, totalValue: null, plan: null,
    diagnostics: parsed.error.issues.map(issue => ({ code: 'invalid-input', path: issue.path.join('.'), message: issue.message })),
  };
  const project = parsed.data;
  const definitions = new Map(project.definitions.map(d => [d.id, d]));
  const actors = new Map(project.candidate.actors.map(a => [a.id, a]));
  function unique(ids: string[], path: string) {
    const seen = new Set<string>();
    ids.forEach(id => { if (seen.has(id)) report('duplicate-id', path, id); seen.add(id); });
  }
  unique(project.definitions.map(d => d.id), 'definitions');
  unique(project.candidate.actors.map(a => a.id), 'candidate.actors');
  unique(project.timeline.map(r => r.id), 'timeline');
  for (const d of project.definitions) {
    unique(d.nodes.map(n => n.id), `definitions.${d.id}.nodes`);
    unique(d.effects.map(e => e.id), `definitions.${d.id}.effects`);
  }
  const reference = (id: string, path: string) => {
    const d = definitions.get(id);
    if (!d) report('missing-reference', path, id);
    return d;
  };
  for (const actor of project.candidate.actors) {
    reference(actor.character, `candidate.actors.${actor.id}.character`);
    reference(actor.weapon, `candidate.actors.${actor.id}.weapon`);
  }
  for (const d of project.definitions) {
    for (const effect of d.effects) {
      if (effect.action) reference(effect.action, `definitions.${d.id}.effects.${effect.id}.action`);
    }
  }
  for (const record of project.timeline) {
    reference(record.definition, `timeline.${record.id}.definition`);
    if (!actors.has(record.actor)) report('missing-reference', `timeline.${record.id}.actor`, record.actor);
  }
  for (const id of project.objective.damageIds ?? []) {
    if (!project.timeline.some(r => r.kind === 'damage' && r.id === id)) report('missing-reference', 'objective.damageIds', id);
  }
  const points: WorkbenchPoint[] = [];
  let operations = 0;
  const timeline = [...project.timeline].sort((a, b) => a.timeMs - b.timeMs || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const record of timeline.filter(r => r.kind === 'damage')) {
    const actor = actors.get(record.actor);
    const definition = definitions.get(record.definition);
    const point: WorkbenchPoint = { id: record.id, value: null, formula: { definition: record.definition, root: definition?.damage ?? null, effects: [] }, sources: [] };
    points.push(point);
    if (!actor || !definition) continue;
    let bonus = 0;
    let gameDamageUsed = false;
    const source = (d: Definition, path: string) => {
      if (!point.sources.some(s => s.path === path)) point.sources.push({ path, definition: d.id, version: d.version, source: d.source });
    };
    function condition(key: string, path: string): boolean | null {
      const value = Object.hasOwn(project.conditions, key) ? project.conditions[key] : undefined;
      if (value === undefined || value === null) { report('unknown', path, `Condition ${key} is unknown`); return null; }
      return value;
    }
    function evaluate(d: Definition, id: string, stack: Set<string> = new Set()): Quantity | null {
      const path = `timeline.${record.id}.definitions.${d.id}.nodes.${id}`;
      if (++operations > 100000 || stack.size >= 128) { report('unsupported', path, 'Expression evaluation budget exceeded (100000 operations / 128 depth)'); return null; }
      source(d, path);
      if (stack.has(id)) { report('cycle', path, `Expression cycle at ${id}`); return null; }
      const node = d.nodes.find(n => n.id === id);
      if (!node) { report('missing-reference', path, id); return null; }
      const next = new Set(stack).add(id);
      switch (node.op) {
        case 'game-damage': {
          gameDamageUsed = true;
          const real = evaluateRealDamage(actor?.realBuild, record.realDamage, project.enemy, bonus);
          point.real = real;
          for (const issue of real.issues) report(issue.code, path, issue.message);
          return real.value === null ? null : { value: real.value, unit: 'damage' };
        }
        case 'constant': return node.quantity;
        case 'input': {
          const q = actor && Object.hasOwn(actor.inputs, node.key) ? actor.inputs[node.key] : undefined;
          if (!q) { report('unknown', path, `Input ${node.key} is missing`); return null; }
          if (q.unit !== node.unit) { report('unit', path, `Expected ${node.unit}, received ${q.unit}`); return null; }
          return q;
        }
        case 'unsupported': report('unsupported', path, node.capability); return null;
        case 'condition': {
          const value = condition(node.key, path);
          return value === null ? null : evaluate(d, value ? node.yes : node.no, next);
        }
        case 'add': case 'multiply': case 'divide': {
          const left = evaluate(d, node.left, next);
          const right = evaluate(d, node.right, next);
          if (!left || !right) return null;
          let unit: WorkbenchUnit;
          if (node.op === 'add') {
            if (left.unit !== right.unit) { report('unit', path, 'Addition requires identical units'); return null; }
            unit = left.unit;
          } else if (node.op === 'multiply') {
            if (left.unit !== 'scalar' && right.unit !== 'scalar') { report('unit', path, 'Multiplication requires a scalar operand'); return null; }
            unit = left.unit === 'scalar' ? right.unit : left.unit;
          } else {
            if (right.unit !== 'scalar' && left.unit !== right.unit) { report('unit', path, 'Invalid division units'); return null; }
            unit = left.unit === right.unit ? 'scalar' : left.unit;
          }
          const value = node.op === 'add' ? left.value + right.value : node.op === 'multiply' ? left.value * right.value : left.value / right.value;
          if (!Number.isFinite(value)) { report('arithmetic', path, 'Non-finite arithmetic result'); return null; }
          return { value, unit };
        }
      }
    }
    if (!definition.damage) { report('missing-reference', `timeline.${record.id}.damage`, 'Definition has no damage root'); continue; }
    let complete = true;
    for (const equipment of [actor.character, actor.weapon]) {
      const d = definitions.get(equipment);
      if (!d) { complete = false; continue; }
      for (const effect of d.effects) {
        const triggers = effect.action ? timeline.filter(r => r.kind === 'action' && r.actor === actor.id && r.definition === effect.action) : [null];
        for (const trigger of triggers) {
          const start = (trigger?.timeMs ?? 0) + effect.startMs;
          const end = (trigger?.timeMs ?? 0) + effect.endMs;
          if (record.timeMs < start || record.timeMs >= end) continue;
          if (trigger && record.timeMs === trigger.timeMs && timeline.indexOf(trigger) > timeline.indexOf(record)) continue;
          const path = `timeline.${record.id}.definitions.${d.id}.effects.${effect.id}`;
          source(d, path);
          point.formula.effects.push({ definition: d.id, effect: effect.id, action: trigger?.id ?? null });
          const active = effect.condition ? condition(effect.condition, path) : true;
          if (active === null) { complete = false; continue; }
          if (!active) continue;
          const q = evaluate(d, effect.value);
          if (!q) { complete = false; continue; }
          if (q.unit !== 'scalar') { report('unit', path, 'Damage bonus must be scalar'); complete = false; continue; }
          bonus += q.value;
        }
      }
    }
    const base = evaluate(definition, definition.damage);
    if (base === null) complete = false;
    if (!complete && point.real?.status === 'complete') {
      const invalidEffect = diagnostics.some(issue => issue.path.startsWith(`timeline.${record.id}.`) && issue.code !== 'unknown' && issue.code !== 'unsupported');
      point.real = { ...point.real, status: invalidEffect ? 'invalid' : 'partial', value: null,
        diagnostics: [...point.real.diagnostics, '区间效果未能完整求值，伤害尚不能确认。'] };
    }
    if (base && base.unit !== 'attack' && base.unit !== 'damage') { report('unit', `timeline.${record.id}`, 'Damage root requires attack or damage units'); complete = false; }
    const value = base ? base.value * (gameDamageUsed ? 1 : 1 + bonus) : NaN;
    if (complete && Number.isFinite(value)) point.value = value;
    else if (complete) report('arithmetic', `timeline.${record.id}`, 'Non-finite damage result');
  }
  const invalid = diagnostics.some(d => d.code !== 'unknown' && d.code !== 'unsupported');
  const selected = points.filter(p => !project.objective.damageIds || project.objective.damageIds.includes(p.id));
  const sum = (items: WorkbenchPoint[]) => {
    if (items.some(p => p.value === null)) return null;
    const value = items.reduce((total, p) => total + (p.value ?? 0), 0);
    if (!Number.isFinite(value)) { report('arithmetic', 'objective', 'Non-finite aggregate'); return null; }
    return value;
  };
  const objectiveValue = invalid ? null : sum(selected);
  const totalValue = invalid ? null : sum(points);
  const aggregateInvalid = diagnostics.some(d => d.code === 'arithmetic');
  return { status: invalid || aggregateInvalid ? 'invalid' : points.some(p => p.value === null) ? 'partial' : 'complete', points,
    objectiveValue: aggregateInvalid ? null : objectiveValue, totalValue: aggregateInvalid ? null : totalValue, diagnostics, plan: project };
}
