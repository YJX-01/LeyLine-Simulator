/**
 * Enumerate every catalog buff and each declared effect without treating a buff key
 * or a matching attribute as proof that all of its effects are equivalent.
 * `candidates` is the Map returned by singleHitCandidates; it is optional.
 */
export function batchMonaBuffs(monaRows, leylineRows, candidates = new Map(), { resonanceAudit, characterAudit } = {}) {
  const buffs = monaRows.filter(row => row.kind === 'buff').slice().sort((a, b) => a.key.localeCompare(b.key, 'en'));
  const effects = monaRows.filter(row => row.kind === 'effect');
  const after = new Map(leylineRows.map(row => [row.id, row]));
  const byKey = new Map();
  for (const effect of effects) {
    const group = byKey.get(effect.key) ?? [];
    group.push(effect);
    byKey.set(effect.key, group);
  }
  const rows = [];
  for (const buff of buffs) {
    const declared = (byKey.get(buff.key) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id, 'en'));
    for (const effect of declared) {
      const links = (candidates.get(effect.id) ?? []).map(candidate => {
        const target = after.get(candidate.id);
        if (!target || target.subject !== 'modifier') return null;
        return { id: target.id, revision: target.revision ?? null, source: target.source, reasons: candidate.reasons };
      }).filter(Boolean);
      rows.push({ id: effect.id, buffId: buff.id, key: buff.key, kind: 'declared-effect', effect: effect.effect,
        when: effect.when, variables: effect.variables, source: effect.source, catalogSource: buff.source,
        candidates: links, verifiedScenarios: effect.id === 'mona:effect:character:ShenheE:0' && after.has('character:shenhe:modifier:/talents/1/buffs/0/modifiers/0') ? [{
          recipient: 'kaeya', recipientHit: 'kaeya.skill.param1', source: 'shenhe',
          condition: 'shenhe.quillTap', scope: 'cryo skill hit at level one; source attack varied',
          target: 'character:shenhe:modifier:/talents/1/buffs/0/modifiers/0',
          evidence: 'tools/data/sources/mona-community/589ac6919057709924c0c20d5a9d673fe9b0be1a/single-hit-pilot.json#/mappings/2',
        }] : [], disposition: 'open',
        unresolved: ['independent source and recipient binding', 'activation and effect conditions', 'value and scope equivalence'] });
    }
    // A declaration does not prove that adapters or legacy execution add no other effects.
    if (!declared.length || buff.adapter) rows.push({ id: `mona:buff-batch:opaque:${buff.key}`, buffId: buff.id,
      key: buff.key, kind: 'opaque', source: buff.source, adapter: buff.adapter, candidates: [], disposition: 'open',
      unresolved: ['effect extraction from adapter or legacy implementation', 'source, recipient, conditions and value'] });
  }
  for (const audit of characterAudit?.rows ?? []) {
    if (audit.status !== 'matched') continue;
    const row = rows.find(item => item.id === audit.effectId);
    const target = after.get(audit.targetId);
    const expectedAttribute = { attackPercent: 'ATKPercentage', defensePercent: 'DEFPercentage', critRate: 'CriticalBase', elementalMastery: 'ElementalMastery' }[audit.stat] ?? (/^(pyro|cryo|electro|hydro|geo|anemo|dendro)Bonus$/.test(audit.stat) ? 'Bonus' + audit.stat[0].toUpperCase() + audit.stat.slice(1, -5) : undefined);
    if (!row || !expectedAttribute || row.effect?.attribute !== expectedAttribute || row.effect?.value !== audit.amount
      || target?.binding?.modifier?.target !== 'attribute.' + audit.stat) continue;
    row.verifiedScenarios.push({ ...audit, target: { id: target.id, revision: target.revision, source: target.source } });
  }
  // Runtime-reviewed components remain separate from the opaque catalog key: a
  // multi-effect key is never closed because one of its components matches.
  for (const audit of resonanceAudit?.rows ?? []) {
    if (audit.status !== 'matched') continue;
    const buff = buffs.find(item => item.key === audit.key);
    const target = after.get('public:resonances:modifier:' + audit.field);
    if (!buff || !target || target.binding?.modifier?.target !== 'attribute.' + audit.stat) continue;
    rows.push({ id: `mona:buff-component:${audit.key}:${audit.stat}`, buffId: buff.id, key: buff.key,
      kind: 'verified-component', disposition: 'matched-scenario', source: buff.source,
      target: { id: target.id, revision: target.revision ?? null, source: target.source },
      verifiedScenarios: [audit], scope: audit.scope });
  }
  const mappings = rows.filter(row => row.kind === 'declared-effect').flatMap(row =>
    row.verifiedScenarios.filter(scenario => scenario.status === 'matched' && scenario.target?.id).map(scenario => ({
      id: 'buff-scenario:' + scenario.effectId + ':' + scenario.target.id,
      disposition: 'matched', coverage: 'scenario', mona: [scenario.effectId], leyline: [{ id: scenario.target.id, revision: scenario.target.revision }],
      explanation: `${scenario.scope} Source ${scenario.source}; recipient ${scenario.recipient}; tested gate: ${JSON.stringify(scenario.gate)}. This mapping is limited to the tested scenario.`,
      sources: scenario.evidence,
      comparisons: [
        { name: 'Mona selected-buff delta', expected: scenario.monaExpected, actual: scenario.monaDelta, tolerance: 1e-7 },
        { name: 'LeyLine off/on modifier delta', expected: scenario.amount, actual: scenario.leylineDelta, tolerance: 1e-7 },
      ],
    })));
  return { rows, mappings, summary: { catalogBuffs: buffs.length, declaredEffects: rows.filter(row => row.kind === 'declared-effect').length,
    opaqueBuffs: rows.filter(row => row.kind === 'opaque').length, candidateEffects: rows.filter(row => row.candidates?.length).length,
    verifiedComponents: rows.filter(row => row.kind === 'verified-component').length, verifiedDeclaredEffects: rows.filter(row => row.kind === 'declared-effect' && row.verifiedScenarios.length).length, closedEffects: 0 }, limitations: [
      'Candidate links are leads only; owner and target similarity do not establish source, recipient, conditions, value or scope.',
      'Opaque adapters and legacy effects are represented once per key, not assumed to contain only one effect.',
      'A declared effect does not establish runtime execution or completeness of the upstream implementation.'
    ] };
}
