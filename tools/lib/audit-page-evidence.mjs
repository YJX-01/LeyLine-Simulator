/** Index exact inventory references once so rendering does not rescan the report. */
export function buildEvidence(report) {
  const rows = new Map();
  const index = new Map();
  const children = new Map();
  for (const side of ['mona', 'leyline']) for (const item of report[side] ?? []) {
    rows.set(`${side}\0${item.id}`, item);
    if (item.parentId) {
      const list = children.get(item.parentId) ?? [];
      list.push(item);
      children.set(item.parentId, list);
    }
  }
  const add = (id, kind, value) => {
    if (typeof id !== 'string') return;
    let entry = index.get(id);
    if (!entry) index.set(id, entry = {});
    (entry[kind] ??= []).push(value);
  };
  const ids = value => Array.isArray(value) ? value.flatMap(ids) : typeof value === 'string' ? [value] : value && typeof value === 'object' && typeof value.id === 'string' ? [value.id] : [];
  for (const link of report.links ?? []) for (const id of [...ids(link.mona), ...ids(link.leyline)]) add(id, 'links', link);
  for (const [batch, records] of Object.entries(report.batches ?? {})) for (const record of records ?? []) {
    const refs = [record.id, record.mona, record.leyline, record.buffId, record.effectId, record.targetId, record.targetIds, record.extraTargetIds, record.target, record.branch];
    for (const id of new Set(refs.flatMap(ids))) add(id, 'batches', { batch, record });
  }
  for (const source of ['ordinaryScaling', 'buffProbes', 'equipment', 'transformative', 'aino']) for (const record of report[source]?.rows ?? []) {
    for (const id of new Set([record.id, record.mona, record.leyline, record.buffId, record.effectId, record.targetId, record.skillId].flatMap(ids))) add(id, 'observations', { source, record });
  }
  const reactionLinks = new Map();
  for (const link of report.links ?? []) for (const id of ids(link.mona)) {
    if (!id.startsWith('mona:reaction:')) continue;
    const targets = reactionLinks.get(id) ?? new Set();
    for (const target of ids(link.leyline)) targets.add(target);
    reactionLinks.set(id, targets);
  }
  for (const record of report.transformative?.rows ?? []) {
    if (!record.key) continue;
    const id = 'mona:reaction:' + record.key;
    add(id, 'reactionPairs', record);
    for (const target of reactionLinks.get(id) ?? []) add(target, 'reactionPairs', record);
  }
  for (const issue of report.gaps?.issues ?? []) for (const id of new Set([issue.id, issue.mona, issue.leyline].flatMap(ids))) add(id, 'issues', issue);
  return row => {
    const inventory = [...new Set(row.sourceIds ?? [])].map(id => rows.get(`${row.side}\0${id}`)).filter(Boolean);
    const collect = kind => [...new Set(inventory.flatMap(item => index.get(item.id)?.[kind] ?? []))];
    const links = collect('links');
    const candidates = inventory.flatMap(item => (item.candidates ?? []).map(candidate => ({ sourceId: item.id, ...candidate })));
    const batches = collect('batches');
    const observations = collect('observations');
    const issues = collect('issues');
    const related = [...new Set(inventory.flatMap(item => [item, ...(children.get(item.id) ?? [])]))];
    const branches = related.filter(item => item.kind === 'output-branch');
    const errors = related.filter(item => item.kind === 'open' && item.id?.startsWith('mona:open:probe:'));
    const probes = observations.filter(item => item.source === 'buffProbes').map(item => item.record);
    const probeCalls = probes.filter(probe => probe.diagnostic?.kind !== 'invalid-input')
      .flatMap(probe => ['attribute', 'damage', 'lockedAttribute', 'lockedDamage'].map(key => probe.comparison?.[key]).filter(Boolean));
    const positiveProbe = probeCalls.some(call => call.status === 'ok' && (call.changes ?? []).some(change =>
      Number.isFinite(change.before) && Number.isFinite(change.after) && change.before !== change.after));
    const reactionPairs = collect('reactionPairs');
    const monaSuccess = reactionPairs.some(item => Number.isFinite(item.mona)) || branches.length > 0 || positiveProbe
      || probes.some(p => p.behaviorEvidence?.some(e => Number.isFinite(e.enabled) && e.before === e.disabled && e.enabled !== e.disabled)) || batches.some(({ record }) =>
      (Number.isFinite(record.monaDelta) && record.monaDelta !== 0) ||
      (record.cases ?? []).some(item => Number.isFinite(item.mona?.actual)) ||
      (record.verifiedScenarios ?? []).some(item => Number.isFinite(item.monaDelta) && item.monaDelta !== 0));
    const leylineEvidence = inventory.filter(item => item.evidence?.status === 'available' &&
      item.evidence.refs?.length && Number.isFinite(item.evidence.comparison?.value) && Number.isFinite(item.evidence.comparison?.expected));
    // Equipment source checks do not by themselves establish runtime execution.
    const leylineProofs = inventory.flatMap(item => item.evidence?.status === 'available'
      ? (item.evidence.proofs ?? []).filter(proof => proof.audit !== 'equipment' && proof.audit && proof.cases > 0 && proof.refs?.length)
      : []);
    const leylineSuccess = reactionPairs.some(item => Number.isFinite(item.leyline)) || leylineEvidence.length > 0 || leylineProofs.length > 0 || batches.some(({ record }) =>
      (Number.isFinite(record.leylineDelta) && record.leylineDelta !== 0) ||
      (record.cases ?? []).some(item => Number.isFinite(item.leyline?.actual)) ||
      (record.verifiedScenarios ?? []).some(item => Number.isFinite(item.leylineDelta) && item.leylineDelta !== 0));
    const monaFailure = errors.length > 0 || probeCalls.some(call => call.status === 'error');
    const sideRuns = { mona: monaFailure ? '执行失败' : monaSuccess ? '已跑通' : '未验证',
      leyline: leylineSuccess ? '已跑通' : '未验证' };
    const runStates = [...new Set(Object.values(sideRuns))];
    const run = sideRuns[row.side] ?? '未验证';
    const pairs = [];
    const pair = (scenario, mona, leyline, tolerance, method, source, candidate = false) => {
      if (!Number.isFinite(mona) || !Number.isFinite(leyline)) return;
      const difference = leyline - mona;
      const result = candidate ? '候选对应待确认' : Math.abs(difference) <= tolerance ? '一致' : '有差异';
      pairs.push({ scenario, mona, leyline, difference, tolerance, result, method, source });
    };
    for (const item of reactionPairs) pair(`${item.key} 等级 ${item.level} 精通 ${item.em} 抗性 ${item.resistance}`, item.mona, item.leyline,
      Math.max(1e-5, Math.abs(item.independent) * 1e-6), '相同输入的两侧运行读数', item);
    for (const { batch, record } of batches) {
      // Equal expected units are necessary: percent panel deltas and raw stat modifiers differ in unit.
      if (Number.isFinite(record.monaExpected) && record.monaExpected === record.expected)
        pair(`${batch} ${record.stat ?? ''}`, record.monaDelta, record.leylineDelta, 1e-7, '同单位增量', record);
      if (record.behaviorEvidence?.mona && record.monaExpected === record.amount) {
        pair([record.key, record.recipient, record.scenarioId].filter(Boolean).join(' / '), record.monaDelta, record.leylineDelta,
          1e-7, '同一受益者的属性增量', record);
      }
      for (const item of record.cases ?? []) {
        if (batch === 'commonInputs') pair(`零命 天赋 ${item.talentLevel} 攻击力 ${item.effectiveAttack?.mona}`, item.mona, item.leyline,
          item.tolerance, '共同攻击面板的实际非暴击伤害', item);
        if (item.commonPanel) pair(`${batch} 天赋等级 ${item.level}`, item.commonPanel.expected, item.commonPanel.actual,
          Math.max(0.000001, Math.abs(item.commonPanel.expected) * .0001), 'Mona 实际读数与 LeyLine 定义在同一面板上的复算值', item, record.status === 'unresolved');
      }
    }
    const comparisons = links.flatMap(link => (link.comparisons ?? []).map(item => {
      const valid = [item.expected, item.actual, item.tolerance].every(Number.isFinite) && item.tolerance >= 0;
      const difference = valid ? item.actual - item.expected : null;
      return { linkId: link.id, ...item, difference, result: !valid ? '待确认' : Math.abs(difference) <= item.tolerance ? '一致' : '有差异' };
    }));
    const linkStates = links.map(link => {
      if (link.disposition === 'mona-only') return '仅 Mona';
      if (link.disposition === 'leyline-only') return '仅 LeyLine';
      if (link.disposition === 'different') return '有差异';
      if (['incomparable', 'conditional'].includes(link.disposition)) return '条件不可比';
      const values = comparisons.filter(item => item.linkId === link.id);
      if (values.some(item => item.result === '有差异')) return '有差异';
      if (!values.length || values.some(item => item.result === '待确认')) return '待确认';
      return link.disposition === 'matched' ? '一致' : '待确认';
    });
    const uniqueStates = [...new Set(linkStates)];
    // Mixed conclusions remain inspectable and are not collapsed into a positive verdict.
    const comparison = pairs.some(p => p.result === '有差异') || uniqueStates.includes('有差异') ? '有差异'
      : uniqueStates.length === 1 ? uniqueStates[0] : uniqueStates.length > 1 || candidates.length ? '待确认' : '无复核映射';
    return { run, comparison, links, candidates, details: { runStates, sideRuns, comparisonStates: uniqueStates, pairs, comparisons, branches, errors, probes, leylineEvidence, leylineProofs, batches, observations, issues } };
  };
}

/** Count mappings and explicit input scenarios separately from numeric checks. */
export function summarizeMappings(report) {
  const mappings = { total: 0, comparable: 0, matched: 0, different: 0, other: 0 };
  const comparisons = { total: 0, comparable: 0, matched: 0, different: 0, other: 0 };
  for (const link of report.links ?? []) {
    mappings.total++;
    const results = (link.comparisons ?? []).map(item => {
      if (![item.expected, item.actual, item.tolerance].every(Number.isFinite) || item.tolerance < 0) return 'other';
      return Math.abs(item.actual - item.expected) <= item.tolerance ? 'matched' : 'different';
    });
    for (const result of results) {
      comparisons.total++;
      comparisons[result]++;
      if (result !== 'other') comparisons.comparable++;
    }
    let state = 'other';
    if (link.disposition === 'different') state = 'different';
    else if (link.disposition === 'matched' && results.length && results.every(result => result !== 'other')) state = results.includes('different') ? 'different' : 'matched';
    mappings[state]++;
    if (state !== 'other') mappings.comparable++;
  }
  // Probe records represent a recipient, selected buff, and explicit input scenario.
  const scenarioIds = new Set();
  for (const records of Object.values(report.batches ?? {})) for (const record of records) {
    if (record.behaviorEvidence?.mona && record.behaviorEvidence?.leyline) {
      for (const state of ['before', 'enabled', 'disabled', ...(record.behaviorEvidence.boundary ? ['off-field'] : [])])
        scenarioIds.add(JSON.stringify([record.key, record.scenarioId, record.recipient, state]));
    }
  }
  for (const row of report.batches?.commonInputs ?? []) for (const c of row.cases ?? []) {
    if (c.monaInput && Number.isFinite(c.mona) && Number.isFinite(c.leyline)) scenarioIds.add(JSON.stringify([row.mona, c.talentLevel, c.flatAttack]));
  }
  for (const probe of report.buffProbes?.rows ?? []) {
    if (probe.id && probe.scenario?.id && probe.input) scenarioIds.add(probe.id);
  }
  for (const item of report.mona ?? []) {
    if (item.kind === 'output-branch' && item.parentId && item.scenario?.id && item.scenario.input) {
      scenarioIds.add(JSON.stringify([item.parentId, item.scenario.id, item.scenario.constellation]));
    }
  }
  const transformative = (report.transformative?.rows ?? []).filter(item => Number.isFinite(item.mona) && Number.isFinite(item.leyline));
  const direct = { total: transformative.length, matched: 0, different: 0, scope: '剧变反应相同输入的两侧运行读数' };
  for (const item of transformative) {
    if (Number.isFinite(item.independent) && Math.abs(item.leyline - item.mona) <= Math.max(1e-5, Math.abs(item.independent) * 1e-6)) direct.matched++;
    else direct.different++;
  }
  return { mappings, comparisons, scenarios: { total: scenarioIds.size }, direct };
}
