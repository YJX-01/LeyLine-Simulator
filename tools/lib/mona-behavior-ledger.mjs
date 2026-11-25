import { buildInventory } from './audit-page-inventory.mjs';
import { buildEvidence } from './audit-page-evidence.mjs';
import { conditionalBranches, declaredFacets, semanticId, sourceScope } from './mona-behavior-scope.mjs';
import { classifyMonaDifferences } from './mona-difference-attribution.mjs';
import { createHash } from 'node:crypto';

export const facetNames = {
  formula: '单次伤害公式', element: '元素', scaling: '缩放属性', curve: '等级倍率', hit: '命中段',
  reaction: '反应分支', attribute: '属性变化', condition: '启用与禁用', trigger: '触发器',
  events: '次数与事件顺序', recipient: '受益对象', 'off-field': '站场与后台',
  team: '队伍限制', stacks: '叠层上限', refresh: '刷新', expiry: '到期', scope: '条件分支归属',
};
export const gapNames = {
  scope: '待判定范围', mapping: '对应关系待确认', binding: '正式绑定待定位', implementation: '缺正式实现',
  unverified: '缺本行为运行证据', failed: '运行失败', comparison: '缺同输入对照', difference: '差异待归因',
  absent: '上期来源或绑定消失',
};
const keyOf = ref => typeof ref === 'string' ? ref : ref.id;
const compare = (a, b, tolerance) => [a, b, tolerance].every(Number.isFinite) && tolerance >= 0 && Math.abs(a - b) <= tolerance;
const reactionCases = (report, links, item) => {
  const keys = new Set(links.flatMap(link => link.mona ?? []).filter(id => id.startsWith('mona:reaction:')).map(id => id.slice(14)));
  if (item.kind === 'reaction-field') keys.add(item.key);
  return (report.transformative?.rows ?? []).filter(r => keys.has(r.key) || (item.source && r.provenance?.coefficient === item.source));
};

/** Only credit a specific claim for which the indicated execution produced readings. */
function evidenceForFacet(item, facet, side, evidence, report, links, sourceIds, attribution) {
  const { details } = evidence;
  const proof = { local: false, bilateral: false, failed: false, difference: false };
  if (facet === 'formula' && (item.kind === 'reaction-field' || item.binding?.identity?.id?.endsWith('.coefficient'))) {
    const cases = reactionCases(report, links, item);
    if (cases.length) {
      proof.local = cases.every(row => Number.isFinite(row[side]));
      proof.failed = !proof.local;
      proof.difference = cases.some(row => !compare(row.mona, row.leyline, row.tolerance ?? Math.max(1e-5, Math.abs(row.independent) * 1e-6))
        && !links.some(link => link.id === 'transformative-' + row.key && attribution.get(link.id)?.status === 'attributed'));
      proof.bilateral = proof.local && !proof.difference && cases.every(row => compare(row.leyline, row.independent, row.tolerance ?? Math.max(1e-5, Math.abs(row.independent) * 1e-6)));
      return proof;
    }
  }
  if (side === 'mona' && item.kind === 'output-branch' && ['formula', 'element', 'hit', 'reaction'].includes(facet)) {
    proof.local = details.branches.length > 0 && details.branches.every(row => Number.isFinite(row.result?.non_critical) && row.result.non_critical !== 0);
  }
  if (side === 'leyline' && (facet === 'formula' || facet === 'hit') && item.subject?.endsWith('hit')) {
    const c = item.evidence?.comparison;
    proof.local = item.evidence?.status === 'available' && item.evidence.refs?.length > 0
      && compare(c?.value, c?.expected, Math.max(1e-8, Math.abs(c?.expected) * 1e-6));
    proof.failed = Number.isFinite(c?.value) && Number.isFinite(c?.expected) && !proof.local;
  }
  if (facet === 'attribute' || facet === 'condition') {
    proof.local = side === 'mona' && details.probes.some(p => p.behaviorEvidence?.some(e =>
      e.side === side && e.source && e.recipient && Number.isFinite(e.enabled) && Object.hasOwn(e, 'before')
      && e.before === e.disabled && e.enabled !== e.disabled && e.disabledProbeId));
    proof.failed = evidence.run === '执行失败';
  }
  const matchedCommonInputs = new Set();
  for (const { batch, record } of details.batches) {
    if (batch === 'commonInputs' && ['formula', 'hit', 'element'].includes(facet)) {
      const matched = record.status === 'matched' && record.cases?.length >= 3 && record.cases.every(c =>
        c.element && !c.requiredInputs?.length && compare(c.mona, c.leyline, c.tolerance)
        && compare(c.effectiveAttack?.mona, c.effectiveAttack?.leyline, 1e-7));
      // These checks exercise a specific C0 normal output. The talent curve and
      // other observed configurations are separate claims.
      proof.local ||= Boolean(matched);
      if (matched) matchedCommonInputs.add(record[side]);
      proof.difference ||= record.cases.some(c => Number.isFinite(c.mona) && Number.isFinite(c.leyline) && !compare(c.mona, c.leyline, c.tolerance));
    }
    const observation = record.behaviorEvidence;
    if (observation?.source && observation.recipient && observation.attribute
      && [record.effectId, record.targetId, ...(record.extraTargetIds ?? [])].includes(item.id)) {
      const reading = observation[side];
      const expected = side === 'leyline' ? record.amount : record.monaExpected;
      const valid = reading && reading.disabledCondition && compare(reading.before, reading.disabled, 1e-7)
        && Number.isFinite(expected) && expected !== 0 && compare(reading.enabled - reading.before, expected, 1e-7);
      if (facet === 'attribute' || facet === 'condition') {
        proof.local ||= Boolean(valid);
        proof.failed ||= !valid;
        // Some Mona deltas are flat panel points while LeyLine reports a fraction.
        if (Number.isFinite(record.amount) && record.monaExpected === record.amount) {
          const same = compare(record.monaDelta, record.leylineDelta, 1e-7);
          proof.bilateral ||= Boolean(valid && record.status === 'matched' && same);
          proof.difference ||= !same;
        }
      }
      if (facet === 'off-field' && observation.boundary) {
        const b = observation.boundary;
        const mona = compare(b.monaEnabled, b.monaBefore, 1e-7);
        const leyline = compare(b.leyline, record.leylineBefore, 1e-7);
        proof.local ||= Boolean(valid && (side === 'mona' ? mona : leyline));
        proof.bilateral ||= Boolean(valid && mona && leyline && record.status === 'matched');
        proof.difference ||= mona !== leyline;
      }
    }
  }
  proof.bilateral ||= sourceIds.every(id => matchedCommonInputs.has(id));
  return proof;
}

function implementationFor(item, side, links, formal) {
  const bindings = side === 'leyline' ? [item] : links.flatMap(link => (link.leyline ?? []).map(ref => formal.get(keyOf(ref))).filter(Boolean));
  if (bindings.some(r => r.binding && !String(r.binding.definition?.support).includes('unavailable'))) return 'bound';
  if (bindings.some(r => String(r.binding?.definition?.support).includes('unavailable'))
    || links.some(link => link.disposition === 'mona-only')) return 'implementation';
  return 'binding';
}

export function buildBehaviorLedger(report, inventory = buildInventory(report), evidenceFor = buildEvidence(report)) {
  const behaviors = [], assignments = new Map(), seen = new Set(), product = {};
  const formal = new Map(report.leyline.map(item => [item.id, item]));
  const menus = new Map(report.mona.filter(item => item.kind === 'skill').map(item => [item.character.toLowerCase() + ':' + item.index, item.id]));
  const attribution = new Map(classifyMonaDifferences(report.links, report.batches?.ordinarySourceDifferences, report.transformative, report.leyline).map(item => [item.id, item]));
  const ownerCounts = {};
  for (const row of inventory) {
    const grouped = new Map();
    for (const item of row.source) {
      const scope = sourceScope(item, row.category);
      if (item.kind === 'action') scope.owner = menus.get(item.key.split('.')[0] + ':' + item.value?.index) ?? scope.owner;
      if (assignments.has(item.id)) throw new Error('来源编号重复 ' + item.id);
      assignments.set(item.id, scope);
      if (row.side === 'leyline' && item.binding && scope.role === 'behavior') {
        const bound = implementationFor(item, row.side, [], formal) === 'bound';
        const { modifiers, ...grant } = item.binding.buff ?? {};
        const definition = item.binding.modifier ? { grant, modifier: item.binding.modifier } :
          item.binding.definition ?? item.binding;
        const signature = createHash('sha256').update(JSON.stringify(definition)).digest('hex');
        product[semanticId(item, row.id)] = { bound, signature, rowId: row.id, source: row.sourcePath, name: row.name, run: false };
      }
      const countKey = row.side + '/' + scope.role;
      ownerCounts[countKey] = (ownerCounts[countKey] ?? 0) + 1;
      for (const branch of conditionalBranches(item)) {
        const id = [semanticId(item, row.id), branch.category, branch.facet, branch.key].join('|');
        grouped.set(id, { item, facet: branch.facet, category: branch.category, sourceIds: [item.id], condition: branch.condition });
      }
      // Equivalent observations of one branch share a behavior, but their mappings
      // and run evidence are checked across every observed configuration below.
      for (const category of scope.categories ?? []) {
        const identity = semanticId(item, row.id);
        const facets = declaredFacets(item, category);
        for (const facet of facets) {
          const id = [identity, category, facet].join('|');
          if (!grouped.has(id)) grouped.set(id, { item, facet, category, sourceIds: [] });
          grouped.get(id).sourceIds.push(item.id);
        }
      }
    }
    const scopes = new Map();
    for (const [id, { item, facet, category, sourceIds, condition }] of grouped) {
      if (seen.has(id)) throw new Error('行为编号重复 ' + id);
      seen.add(id);
      const gaps = [];
      if (facet === 'scope') {
        gaps.push('scope');
        if (item.id.startsWith('mona:open:probe:')) gaps.push('failed');
      }
      else {
        const scopeKey = sourceIds.join('\n');
        let evidence = scopes.get(scopeKey);
        if (!evidence) {
          evidence = evidenceFor({ ...row, sourceIds });
          scopes.set(scopeKey, evidence);
        }
        const links = evidence.links;
        const linked = new Set(links.flatMap(link => link[row.side].map(keyOf)));
        if (sourceIds.some(source => !linked.has(source))) gaps.push('mapping');
        const proof = evidenceForFacet(item, facet, row.side, evidence, report, links, sourceIds, attribution);
        const binding = implementationFor(item, row.side, links, formal);
        if (binding !== 'bound') gaps.push(binding);
        const formalItem = row.side === 'leyline' && product[semanticId(item, row.id)];
        if (formalItem?.bound && proof.local && !proof.failed && (facet === 'formula' || facet === 'attribute')) {
          formalItem.run = true;
        }
        const exclusive = links.length && links.every(link => link.disposition === row.side + '-only' && link.sources?.length && link.explanation);
        if (proof.failed) gaps.push('failed');
        else if (!proof.local) gaps.push('unverified');
        if (proof.difference || links.some(link => link.disposition === 'different' && attribution.get(link.id)?.status !== 'attributed')) gaps.push('difference');
        if (!proof.bilateral && !exclusive) gaps.push('comparison');
      }
      behaviors.push({ id, rowId: row.id, side: row.side, category, facet, gaps, source: row.sourcePath,
        ...(condition ? { reason: condition } : {}),
        ...(sourceIds.length === 1 && sourceIds[0] === row.id ? {} : { sourceIds }),
        ...(facet === 'scope' ? { reason: assignments.get(item.id).reason } : {}) });
    }
  }
  const total = report.mona.length + report.leyline.length;
  if (assignments.size !== total) throw new Error('来源归属不完整');
  const versions = { mona: report.provenance?.mona ?? report.baselines?.mona, leyline: report.provenance?.leyline ?? null,
    worktree: report.provenance?.worktree ?? null };
  return { schema: 1, versions, behaviors, product, ownerCounts, assignments, attribution, issues: report.gaps?.issues ?? [],
    sourceReady: Boolean(versions.mona && versions.leyline && report.mona.length && report.leyline.length) };
}

/** Carry a missing declaration forward until it returns or its scope is explicitly resolved. */
export function reconcileBehaviors(current, previous = null) {
  if (previous && (current.schema !== previous.schema || current.versions.mona !== previous.versions.mona)) {
    throw new Error('行为台账的版本或 Mona 来源不同，无法计算本批变化');
  }
  const old = new Map(previous?.behaviors.map(item => [item.id, item]));
  const now = new Map(current.behaviors.map(item => [item.id, item]));
  for (const [id, item] of old) {
    if (now.has(id)) continue;
    const owners = (item.sourceIds ?? [item.rowId]).map(id => current.assignments.get(id));
    const resolvedScope = owners.length && owners.every(scope => scope?.role === 'excluded' ||
      item.facet === 'scope' && scope?.role === 'behavior');
    now.set(id, { ...item, gaps: resolvedScope ? [] : [...new Set([...item.gaps, 'absent'])],
      ...(resolvedScope ? { reason: owners.map(s => s.reason ?? '已确定来源范围').join('、') } : {}) });
  }
  const emptyCounts = () => Object.fromEntries(['mona', 'leyline'].flatMap(side => ['damage', 'buff', 'unknown'].map(category =>
    [side + '/' + category, { total: 0, opening: 0, discovered: 0, reopened: 0, closed: 0, ending: 0 }])));
  const totals = emptyCounts();
  const batches = new Map();
  for (const item of now.values()) {
    const key = item.side + '/' + item.category;
    if (!batches.has(item.facet)) batches.set(item.facet, { facet: item.facet, behaviors: 0, rows: new Set(), blockers: {}, totals: emptyCounts() });
    const batch = batches.get(item.facet);
    const prior = old.get(item.id);
    const wasOpen = prior?.gaps.length > 0, open = item.gaps.length > 0;
    const transition = open ? (!prior ? 'discovered' : wasOpen ? 'pending' : 'reopened') : wasOpen ? 'closed' : 'verified';
    now.set(item.id, { ...item, transition });
    for (const stats of [totals[key], batch.totals[key]]) {
      stats.total++;
      if (wasOpen) stats.opening++;
      if (open) stats.ending++;
      if (['discovered', 'closed', 'reopened'].includes(transition)) stats[transition]++;
    }
    if (open) {
      batch.behaviors++;
      batch.rows.add(item.rowId);
      for (const gap of item.gaps) batch.blockers[gap] = (batch.blockers[gap] ?? 0) + 1;
    }
  }
  for (const stats of [totals, ...[...batches.values()].map(b => b.totals)].flatMap(Object.values)) {
    if (stats.ending !== stats.opening + stats.discovered + stats.reopened - stats.closed) throw new Error('行为缺口收支不符');
  }
  const productChanges = previous?.product ? Object.entries(current.product).filter(([key, b]) => b.bound && b.run &&
    (!previous.product[key]?.bound || (previous.product[key].signature && previous.product[key].signature !== b.signature)))
    .map(([key, b]) => ({ id: key, rowId: b.rowId, source: b.source, name: b.name })) : [];
  return { schema: current.schema, versions: current.versions, behaviors: [...now.values()], ownerCounts: current.ownerCounts,
    product: current.product, productChanges,
    baseline: previous?.versions ?? null, totals, batches: [...batches.values()].map(b => ({ ...b, rows: b.rows.size })),
    complete: current.sourceReady && current.behaviors.length > 0 && !current.issues.length && [...now.values()].every(item => !item.gaps.length) };
}
