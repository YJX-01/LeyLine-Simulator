import type { Project, Diagnostic, QuantityUnit } from '@leyline/schema';
import { evaluateDamage, resolveBuild } from '../attributes/build';
import type { DamagePoint, EvaluationResult, EffectInstance, AttributeRead } from '@leyline/schema';
import { createCombatStateReader } from '../timeline/combat-state';

type Definition = Project['definitions'][number];
type Effect = Definition['effects'][number];
type RecordEntry = Project['timeline'][number];
type Quantity = { value: number; unit: QuantityUnit };
interface Instance { view: EffectInstance; definition: Definition; effect: Effect; trigger?: RecordEntry; index: number }
interface Context { actor: string; record: RecordEntry; phase: 'before' | 'after'; excluded?: string; point: DamagePoint; trace?: AttributeRead }

/** Demand-driven graph for attributes, effects, captures and historical damage. */
export function evaluateDependencyGraph(project: Project): EvaluationResult {
  const diagnostics: Diagnostic[] = [];
  const report = (code: Diagnostic['code'], path: string, message: string) => {
    if (!diagnostics.some(d => d.code === code && d.path === path && d.message === message)) diagnostics.push({ code, path, message });
  };
  const definitions = new Map(project.definitions.map(d => [d.id, d]));
  const actors = new Map(project.candidate.actors.map(a => [a.id, a]));
  const timeline = [...project.timeline].sort((a, b) => a.timeMs - b.timeMs || a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const records = new Map(timeline.map(r => [r.id, r]));
  const positions = new Map(timeline.map((r, index) => [r.id, index]));
  const unique = (ids: string[], path: string) => { if (new Set(ids).size !== ids.length) report('duplicate-id', path, '标识重复。'); };
  const missing = (id: string, path: string) => report('missing-reference', path, `引用来源缺失：${id}`);
  unique(project.definitions.map(d => d.id), 'definitions');
  unique(project.candidate.actors.map(a => a.id), 'candidate.actors');
  unique(timeline.map(r => r.id), 'timeline');
  unique((project.effectRevisions ?? []).map(r => r.instanceId), 'effectRevisions');
  for (const d of definitions.values()) {
    unique(d.nodes.map(n => n.id), `definitions.${d.id}.nodes`);
    unique(d.effects.map(e => e.id), `definitions.${d.id}.effects`);
    for (const e of d.effects) if (e.action && !definitions.has(e.action)) missing(e.action, `definitions.${d.id}.effects.${e.id}`);
  }
  for (const r of timeline) {
    if (!actors.has(r.actor)) missing(r.actor, `timeline.${r.id}.actor`);
    if (!definitions.has(r.definition)) missing(r.definition, `timeline.${r.id}.definition`);
  }
  for (const id of project.objective.damageIds ?? []) if (records.get(id)?.kind !== 'damage') missing(id, 'objective.damageIds');
  let visits = 0;
  let exhausted = false;
  const active = new Set<string>();
  const touch = (path: string) => {
    if (++visits > 100000 || active.size >= 128) { exhausted = true; report('budget', 'evaluation', '依赖求值超过预算（100000 次访问 / 128 层）。'); return false; }
    return true;
  };
  function graph<T>(key: string, path: string, run: () => T): T | null {
    if (!touch(path)) return null;
    if (active.has(key)) { report('cycle', path, '依赖包含循环引用。'); return null; }
    active.add(key);
    try { return run(); } finally { active.delete(key); }
  }
  const actionGroups = new Map<string, RecordEntry[]>();
  for (const record of timeline) if (record.kind === 'action') {
    const key = JSON.stringify([record.actor, record.definition]);
    const list = actionGroups.get(key) ?? []; list.push(record); actionGroups.set(key, list);
  }
  const revisions = new Map((project.effectRevisions ?? []).map(r => [r.instanceId, r]));
  const instances: Instance[] = [];
  for (const actor of actors.values()) {
    for (const slot of ['character', 'weapon'] as const) {
      const d = definitions.get(actor[slot]);
      if (!d) { missing(actor[slot], `candidate.actors.${actor.id}.${slot}`); continue; }
      for (const effect of d.effects) {
        const triggers = effect.action ? (actionGroups.get(JSON.stringify([actor.id, effect.action])) ?? []) : [undefined];
        for (const trigger of triggers) {
          if (!touch('effects')) break;
          const identity: (string | null)[] = [actor.id, slot, d.id, d.version, effect.id, trigger?.id ?? null];
          if (actor.build) identity.push(actor.build[slot].id, actor.build.dataVersion);
          const id = JSON.stringify(identity);
          const recipient = effect.recipient ?? 'self';
          if (recipient !== 'self' && recipient !== 'team' && !actors.has(recipient)) missing(recipient, `effects.${id}.recipient`);
          instances.push({ definition: d, effect, trigger, index: instances.length, view: { id, owner: actor.id, slot, definition: d.id, version: d.version, effect: effect.id,
            action: trigger?.id ?? null, startMs: (trigger?.timeMs ?? 0) + effect.startMs, endMs: (trigger?.timeMs ?? 0) + effect.endMs,
            recipient, attribute: effect.attribute ?? 'damageBonus', unit: effect.unit ?? 'scalar', disabled: revisions.get(id)?.disabled ?? false } });
        }
        if (exhausted) break;
      }
      if (exhausted) break;
    }
    if (exhausted) break;
  }
  const groupRules = new Map<string, string>();
  for (const instance of instances) {
    const view = instance.view;
    if (!instance.effect.group) continue;
    const recipients = view.recipient === 'team' ? [...actors.keys()] : [view.recipient === 'self' ? view.owner : view.recipient];
    for (const recipient of recipients) {
      if (!touch('effects.groups')) break;
      const key = JSON.stringify([recipient, view.attribute, instance.effect.group]);
      const policy = instance.effect.policy ?? 'add';
      const rule = JSON.stringify([policy, policy === 'stack' ? instance.effect.maxStacks ?? 1 : null]);
      const previous = groupRules.get(key);
      if (previous !== undefined && previous !== rule) report('invalid-input', `effects.groups.${key}`, '同一覆盖组的覆盖规则与叠层上限必须一致。');
      groupRules.set(key, rule);
    }
    if (exhausted) break;
  }
  const instanceIds = new Set(instances.map(i => i.view.id));
  for (const revision of project.effectRevisions ?? []) if (!instanceIds.has(revision.instanceId)) report('stale-revision', `effectRevisions.${revision.instanceId}`, '来源已删除、换装或版本变化，此修订待核对，未附着到其他实例。');
  const reads: AttributeRead[] = [];
  const points = new Map<string, DamagePoint>();
  const completed = new Set<string>();
  const gameDamagePoints = new Set<string>();
  const panels = new Map<string, ReturnType<typeof resolveBuild>>();
  const readState = createCombatStateReader(project);
  const stateReads = new Map<string, ReturnType<typeof readState>['reads'][number]>();
  function combatConditions(actor: string, record: RecordEntry) {
    const state = readState(actor, record);
    for (const read of state.reads) stateReads.set(JSON.stringify([actor, record.id, read.field]), read);
    return state.conditions;
  }
  const ctxKey = (ctx: Context) => JSON.stringify([ctx.actor, ctx.record.id, ctx.phase]);
  const before = (a: RecordEntry, ctx: Context) => (positions.get(a.id) ?? -1) < (positions.get(ctx.record.id) ?? -1) || (a.id === ctx.record.id && ctx.phase === 'after');
  function source(ctx: Context, d: Definition, path: string) {
    if (!ctx.point.sources.some(s => s.path === path)) ctx.point.sources.push({ path, definition: d.id, version: d.version, source: d.source });
  }
  function condition(key: string, path: string) {
    const value = Object.hasOwn(project.conditions, key) ? project.conditions[key] : undefined;
    if (value === undefined || value === null) { report('unknown', path, `条件尚未确认：${key}`); return null; }
    return value;
  }
  function at(ctx: Context, id: string, phase: Context['phase']): Context | null {
    const record = records.get(id);
    if (!record) { missing(id, `timeline.${ctx.record.id}.capture`); return null; }
    return { ...ctx, record, phase };
  }
  function baseAttribute(actorId: string, key: string, unit: QuantityUnit, ctx: Context): Quantity | null {
    const actor = actors.get(actorId);
    if (!actor) { missing(actorId, `timeline.${ctx.record.id}.attribute`); return null; }
    if (key === 'damageBonus') return { value: 0, unit: 'scalar' };
    if (key === 'attack' && actor.build) {
      const conditions = combatConditions(actorId, ctx.record);
      const panelKey = JSON.stringify([actorId, conditions ?? {}]);
      let panel = panels.get(panelKey);
      if (!panel) { panel = resolveBuild(actor.build, conditions); panels.set(panelKey, panel); }
      for (const issue of panel.issues) report(issue.code, `candidate.actors.${actorId}.build`, issue.message);
      return panel.status === 'complete' ? { value: panel.stats.attack, unit: 'attack' } : null;
    }
    const value = Object.hasOwn(actor.inputs, key) ? actor.inputs[key] : undefined;
    if (!value) { report('unknown', `candidate.actors.${actorId}.inputs.${key}`, '属性输入尚未填写。'); return null; }
    if (value.unit !== unit) { report('unit', `candidate.actors.${actorId}.inputs.${key}`, '属性读取单位不匹配。'); return null; }
    return value;
  }
  function effectValue(instance: Instance, ctx: Context): Quantity | null {
    const v = instance.view;
    const path = `timeline.${ctx.record.id}.effects.${v.id}`;
    return graph(`effect:${v.id}:${ctx.record.id}:${ctx.phase}`, path, () => {
      source(ctx, instance.definition, path);
      const revision = revisions.get(v.id);
      if (revision?.value) return revision.value;
      let effectContext: Context = { ...ctx, actor: v.owner, excluded: v.id };
      if (instance.effect.captureAt === 'source') {
        if (!instance.trigger) { report('missing-reference', path, '捕获效果必须关联来源动作。'); return null; }
        effectContext = { ...effectContext, record: instance.trigger, phase: 'before' };
      }
      return nodeValue(instance.definition, instance.effect.value, effectContext);
    });
  }
  function attribute(actorId: string, key: string, unit: QuantityUnit, ctx: Context): Quantity | null {
    const path = `timeline.${ctx.record.id}.attribute.${actorId}.${key}`;
    return graph(`attribute:${actorId}:${key}:${ctx.record.id}:${ctx.phase}:${ctx.excluded ?? ''}`, path, () => {
      const trace: AttributeRead = { id: `read-${reads.length + 1}`, actor: actorId, key, unit, timeMs: ctx.record.timeMs, phase: ctx.phase, recordId: ctx.record.id, instanceId: ctx.excluded, value: null, dependencies: [] };
      reads.push(trace);
      ctx.trace?.dependencies.push(trace.id);
      const base = baseAttribute(actorId, key, unit, ctx);
      let value = base?.value ?? 0;
      let valid = base !== null;
      if (base && base.unit !== unit) { report('unit', path, '属性单位不匹配。'); valid = false; }
      const eligible: Instance[] = [];
      for (const instance of instances) {
        if (!touch(path)) { valid = false; break; }
        const v = instance.view;
        if (v.disabled || v.attribute !== key || (v.recipient === 'self' ? v.owner !== actorId : v.recipient !== 'team' && v.recipient !== actorId)) continue;
        if (ctx.record.timeMs < v.startMs || (instance.trigger && !before(instance.trigger, ctx))) continue;
        if ((instance.effect.policy ?? 'add') === 'add' && ctx.record.timeMs >= v.endMs) continue;
        const enabled = instance.effect.condition ? condition(instance.effect.condition, path) : true;
        if (enabled === null) { valid = false; continue; }
        if (enabled) eligible.push(instance);
      }
      const groups = new Map<string, Instance[]>();
      for (const instance of eligible) {
        const group = instance.effect.group ?? instance.view.id;
        const list = groups.get(group) ?? [];
        list.push(instance); groups.set(group, list);
      }
      for (const entries of groups.values()) {
        entries.sort((a, b) => a.view.startMs - b.view.startMs || (positions.get(a.trigger?.id ?? '') ?? -1) - (positions.get(b.trigger?.id ?? '') ?? -1) || a.index - b.index);
        const first = entries[0];
        const policy = first.effect.policy ?? 'add';
        const limit = policy === 'replace' ? 1 : first.effect.maxStacks ?? 1;
        if (entries.some(entry => (entry.effect.policy ?? 'add') !== policy || (policy === 'stack' && (entry.effect.maxStacks ?? 1) !== limit))) {
          report('invalid-input', path, '同一覆盖组的覆盖规则与叠层上限必须一致。'); valid = false; continue;
        }
        let slots: Instance[] = policy === 'add' ? entries : [];
        if (policy !== 'add') for (const entry of entries) {
          if (!touch(path)) { valid = false; break; }
          slots = slots.filter(previous => { if (!touch(path)) valid = false; return previous.view.endMs > entry.view.startMs; });
          if (exhausted) break;
          slots.push(entry);
          if (slots.length > limit) slots.splice(0, slots.length - limit);
        }
        const selected = exhausted ? [] : slots.filter(entry => entry.view.endMs > ctx.record.timeMs && entry.view.id !== ctx.excluded);
        for (const instance of selected) {
          trace.dependencies.push(instance.view.id);
          if (!ctx.point.formula.effects.some(e => e.definition === instance.view.definition && e.effect === instance.view.effect && e.action === instance.view.action)) ctx.point.formula.effects.push({ definition: instance.view.definition, effect: instance.view.effect, action: instance.view.action });
          const q = effectValue(instance, { ...ctx, trace });
          if (!q) { valid = false; continue; }
          if (q.unit !== unit || instance.view.unit !== unit) { report('unit', path, '效果与接收属性的单位不匹配。'); valid = false; continue; }
          value += q.value;
        }
      }
      if (!Number.isFinite(value)) { report('arithmetic', path, '属性计算不是有限值。'); valid = false; }
      trace.value = valid ? value : null;
      return valid ? { value, unit } : null;
    });
  }
  function nodeValue(d: Definition, id: string, ctx: Context): Quantity | null {
    const path = `timeline.${ctx.record.id}.definitions.${d.id}.nodes.${id}`;
    return graph(`node:${d.id}:${id}:${ctxKey(ctx)}:${ctx.excluded ?? ''}`, path, () => {
      source(ctx, d, path);
      if (ctx.trace && !ctx.trace.dependencies.includes(path)) ctx.trace.dependencies.push(path);
      const node = d.nodes.find(n => n.id === id);
      if (!node) { missing(id, path); return null; }
      switch (node.op) {
        case 'constant': return node.quantity;
        case 'input': {
          const actor = actors.get(ctx.actor);
          const q = actor && Object.hasOwn(actor.inputs, node.key) ? actor.inputs[node.key] : undefined;
          if (!q) { report('unknown', path, `输入尚未填写：${node.key}`); return null; }
          if (q.unit !== node.unit) { report('unit', path, '输入单位不匹配。'); return null; }
          return q;
        }
        case 'attribute': {
          const context = node.at ? at(ctx, node.at, node.phase ?? 'before') : { ...ctx, phase: node.phase ?? ctx.phase };
          return context ? attribute(node.actor ?? ctx.actor, node.key, node.unit, context) : null;
        }
        case 'capture': {
          const context = at(ctx, node.at, node.phase ?? 'before');
          if (!context) return null;
          const trace: AttributeRead = { id: `read-${reads.length + 1}`, actor: ctx.actor, key: `capture:${node.id}`, unit: 'scalar', timeMs: context.record.timeMs, phase: context.phase, recordId: node.at, instanceId: ctx.excluded, value: null, dependencies: [] };
          reads.push(trace); ctx.trace?.dependencies.push(trace.id);
          const q = nodeValue(d, node.value, { ...context, trace });
          if (q) { trace.unit = q.unit; trace.value = q.value; }
          return q;
        }
        case 'history': {
          if (node.actor && !actors.has(node.actor)) { missing(node.actor, path); return null; }
          if (node.definition && !definitions.has(node.definition)) { missing(node.definition, path); return null; }
          if (node.endMs < node.startMs) { report('invalid-input', path, '历史窗口结束早于开始。'); return null; }
          const trace: AttributeRead = { id: `read-${reads.length + 1}`, actor: node.actor ?? ctx.actor, key: `history:${node.id}`, unit: node.mode === 'count' ? 'scalar' : 'damage', timeMs: ctx.record.timeMs, phase: ctx.phase, recordId: ctx.record.id, instanceId: ctx.excluded, value: null, dependencies: [] };
          reads.push(trace); ctx.trace?.dependencies.push(trace.id);
          let resetPosition = -1;
          for (const resetId of node.resetAt ?? []) {
            const reset = records.get(resetId);
            if (!reset) { missing(resetId, path); return null; }
            if (before(reset, ctx)) resetPosition = Math.max(resetPosition, positions.get(resetId) ?? -1);
          }
          let value = node.initial ?? 0;
          let valid = true;
          for (const record of timeline) {
            if (!touch(path)) return null;
            if (record.kind !== 'damage' || record.timeMs < node.startMs || record.timeMs >= node.endMs || (positions.get(record.id) ?? -1) <= resetPosition) continue;
            if (!before(record, ctx) && !(node.includeCurrent && record.id === ctx.record.id)) continue;
            if ((node.actor && record.actor !== node.actor) || (node.definition && record.definition !== node.definition)) continue;
            trace.dependencies.push(`timeline.${record.id}`);
            if (node.mode === 'count') value++;
            else { const q = damageValue(record); if (q === null) valid = false; else value += q; }
          }
          if (node.cap !== undefined) value = Math.min(node.cap, value);
          if (!Number.isFinite(value)) { report('arithmetic', path, '历史累计不是有限值。'); return null; }
          trace.value = valid ? value : null;
          return valid ? { value, unit: node.mode === 'count' ? 'scalar' : 'damage' } : null;
        }
        case 'condition': { const active = condition(node.key, path); return active === null ? null : nodeValue(d, active ? node.yes : node.no, ctx); }
        case 'unsupported': report('unsupported', path, `尚未支持：${node.capability}`); return null;
        case 'game-damage': {
          gameDamagePoints.add(ctx.point.id);
          const attack = attribute(ctx.actor, 'attack', 'attack', ctx);
          const bonus = attribute(ctx.actor, 'damageBonus', 'scalar', ctx);
          const damage = ctx.record.damage ? { ...ctx.record.damage, conditions: combatConditions(ctx.actor, ctx.record) } : undefined;
          // Project-scoped overrides have already been resolved for the current actor.
          if (damage) delete damage.stateOverrides;
          const real = evaluateDamage(actors.get(ctx.actor)?.build, damage, project.enemy, bonus?.value ?? 0, attack?.value);
          ctx.point.real = real;
          for (const issue of real.issues) report(issue.code, path, issue.message);
          return attack && bonus && real.value !== null ? { value: real.value, unit: 'damage' } : null;
        }
        case 'add': case 'multiply': case 'divide': {
          const left = nodeValue(d, node.left, ctx); const right = nodeValue(d, node.right, ctx);
          if (!left || !right) return null;
          let unit: QuantityUnit;
          if (node.op === 'add') {
            if (left.unit !== right.unit) { report('unit', path, '相加要求相同单位。'); return null; }
            unit = left.unit;
          } else if (node.op === 'multiply') {
            if (left.unit !== 'scalar' && right.unit !== 'scalar') { report('unit', path, '相乘至少需要一个倍率。'); return null; }
            unit = left.unit === 'scalar' ? right.unit : left.unit;
          } else {
            if (right.unit !== 'scalar' && left.unit !== right.unit) { report('unit', path, '相除单位不兼容。'); return null; }
            unit = left.unit === right.unit ? 'scalar' : left.unit;
          }
          const value = node.op === 'add' ? left.value + right.value : node.op === 'multiply' ? left.value * right.value : left.value / right.value;
          if (!Number.isFinite(value)) { report('arithmetic', path, '运算结果不是有限值。'); return null; }
          return { value, unit };
        }
      }
    });
  }
  function damageValue(record: RecordEntry): number | null {
    if (completed.has(record.id)) return points.get(record.id)?.value ?? null;
    const path = `timeline.${record.id}`;
    return graph(`damage:${record.id}`, path, () => {
      const d = definitions.get(record.definition);
      const point: DamagePoint = points.get(record.id) ?? { id: record.id, value: null, formula: { definition: record.definition, root: d?.damage ?? null, effects: [] }, sources: [] };
      points.set(record.id, point);
      if (!d?.damage) { missing('damage', path); completed.add(record.id); return null; }
      const ctx: Context = { actor: record.actor, record, phase: 'before', point };
      const base = nodeValue(d, d.damage, ctx);
      const game = gameDamagePoints.has(point.id);
      const bonus = game ? { value: 0, unit: 'scalar' as const } : attribute(record.actor, 'damageBonus', 'scalar', ctx);
      if (base && base.unit !== 'attack' && base.unit !== 'damage') report('unit', path, '伤害根必须为攻击力或伤害单位。');
      else if (base && bonus) {
        const value = base.value * (1 + bonus.value);
        if (Number.isFinite(value)) point.value = value;
        else report('arithmetic', path, '伤害不是有限值。');
      }
      if (point.value === null && point.real?.status === 'complete') point.real = { ...point.real, status: 'partial', value: null, diagnostics: [...point.real.diagnostics, '属性依赖未能完整求值。'] };
      completed.add(record.id);
      return point.value;
    });
  }
  for (const record of timeline) if (record.kind === 'damage') damageValue(record);
  const orderedPoints = timeline.filter(r => r.kind === 'damage').map(record => points.get(record.id) ?? { id: record.id, value: null, formula: { definition: record.definition, root: definitions.get(record.definition)?.damage ?? null, effects: [] }, sources: [] });
  const invalid = diagnostics.some(d => !['unknown', 'unsupported', 'stale-revision', 'budget'].includes(d.code));
  const sum = (selected: DamagePoint[]) => {
    if (invalid || exhausted || selected.some(p => p.value === null)) return null;
    const total = selected.reduce((value, p) => value + (p.value ?? 0), 0);
    if (!Number.isFinite(total)) { report('arithmetic', 'objective', '统计结果不是有限值。'); return null; }
    return total;
  };
  const objectiveValue = sum(orderedPoints.filter(p => !project.objective.damageIds || project.objective.damageIds.includes(p.id)));
  const totalValue = sum(orderedPoints);
  return { status: invalid || diagnostics.some(d => d.code === 'arithmetic') ? 'invalid' : exhausted || diagnostics.some(d => d.code === 'stale-revision') || orderedPoints.some(p => p.value === null) ? 'partial' : 'complete', points: orderedPoints,
    objectiveValue, totalValue, diagnostics, plan: project, effectInstances: instances.map(i => i.view), reads, stateReads: [...stateReads.values()] };
}
