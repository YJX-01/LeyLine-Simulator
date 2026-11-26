import { parseArgs } from 'node:util';
import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { readContentSource } from '../../lib/content-source.mjs';
import { leylineSingleHitInventory, monaCalculationInventory, probeMonaSkills } from '../../lib/mona-inventory-probes.mjs';
import { singleHitCandidates } from '../../lib/mona-single-hit-comparison.mjs';
import { auditMonaOrdinaryBatch, compareMonaOrdinaryScaling } from '../../lib/mona-ordinary-audit.mjs';
import { novice } from '../../lib/roster-audit-settings.mjs';
import {
  loadMonaEntitySpecs,
  loadSpecBuffScenarios,
  loadSpecFourPieceScenarios,
  loadSpecHitScenarios,
} from '../../lib/mona-entity-specs.mjs';
import {
  collectBuffSpecDependencies,
  runSpecBuffScenarios,
  runSpecFourPieceScenarios,
  runSpecHitScenarios,
} from '../../lib/mona-spec-runner.mjs';

const { values } = parseArgs({
  options: {
    character: { type: 'string', multiple: true },
    weapon: { type: 'string', multiple: true },
    set: { type: 'string', multiple: true },
    'skip-ordinary': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
  },
});

const charIds = values.character ?? [];
const weaponIds = values.weapon ?? [];
const setIds = values.set ?? [];

if (!charIds.length && !weaponIds.length && !setIds.length) {
  console.error('Usage: node tools/scripts/data/audit-mona-entity.mjs [--character <id> ...] [--weapon <id> ...] [--set <id> ...] [--skip-ordinary] [--json]');
  process.exit(2);
}

const started = Date.now();
const charSpecs = charIds.length ? loadMonaEntitySpecs({ kinds: ['character'], entities: charIds }) : [];
const weaponSpecs = weaponIds.length ? loadMonaEntitySpecs({ kinds: ['weapon'], entities: weaponIds }) : [];
const setSpecs = setIds.length ? loadMonaEntitySpecs({ kinds: ['set'], entities: setIds }) : [];

const buffScenarios = [
  ...loadSpecBuffScenarios({ kinds: ['character'], entities: charIds }),
  ...loadSpecBuffScenarios({ kinds: ['weapon'], entities: weaponIds }),
  ...loadSpecBuffScenarios({ kinds: ['set'], entities: setIds }),
];
const hitScenarios = charIds.length ? loadSpecHitScenarios({ entities: charIds }) : [];
const fourPieceScenarios = setIds.length ? loadSpecFourPieceScenarios({ entities: setIds }) : [];

const deps = collectBuffSpecDependencies(buffScenarios);
const scope = {
  characters: [...new Set([...charIds, ...deps.characters])],
  weapons: [...new Set([...weaponIds, ...deps.weapons, ...Object.values(novice)])],
  sets: [...new Set([...setIds, ...deps.sets, 'gladiatorsfinale'])],
  actions: [],
};
for (const s of fourPieceScenarios) {
  if (s.recipient && !scope.characters.includes(s.recipient)) scope.characters.push(s.recipient);
}
for (const s of hitScenarios) {
  if (s.weapon && !scope.weapons.includes(s.weapon)) scope.weapons.push(s.weapon);
}

const catalog = await createRuntimeCatalog(scope);
const engine = await loadContentSchema('/src/engine/src/index.ts');
const entities = { characters: [], weapons: [], sets: [] };
for (const [group, list] of Object.entries(entities)) {
  for (const id of scope[group]) list.push(await catalog.get(group, id));
}

// 1. Compile validation on target entities
const compileErrors = [];
for (const id of charIds) {
  const c = entities.characters.find(x => x.id === id);
  const compiled = engine.compileStructuredCharacter(c);
  if (compiled.diagnostics?.some(d => d.severity === 'error')) {
    compileErrors.push({ kind: 'character', id, diagnostics: compiled.diagnostics });
  }
}
for (const id of weaponIds) {
  const w = entities.weapons.find(x => x.id === id);
  const compiled = engine.compileCalculation(w.calculation.bundle);
  if (compiled.diagnostics?.some(d => d.severity === 'error')) {
    compileErrors.push({ kind: 'weapon', id, diagnostics: compiled.diagnostics });
  }
}
for (const id of setIds) {
  const s = entities.sets.find(x => x.id === id);
  const compiled = engine.compileCalculation(s.calculation.bundle);
  if (compiled.diagnostics?.some(d => d.severity === 'error')) {
    compileErrors.push({ kind: 'set', id, diagnostics: compiled.diagnostics });
  }
}

const leyline = await leylineSingleHitInventory(entities);

// 2. Run declarative buff, hit, and 4pc scenarios
const specBuffs = await runSpecBuffScenarios({ scenarios: buffScenarios, entities, engine, leylineRows: leyline.rows });
const specHits = await runSpecHitScenarios({ scenarios: hitScenarios, entities, engine, leylineRows: leyline.rows });
const specFourPiece = await runSpecFourPieceScenarios({ scenarios: fourPieceScenarios, entities, engine, leylineRows: leyline.rows });

// 3. Optionally run ordinary C0 hit audit for requested characters
let ordinarySummary = null;
let ordinaryUnresolved = [];
if (charIds.length && !values['skip-ordinary']) {
  const monaCatalog = readContentSource('tools/data/sources/catalog/mona-community/catalog.json');
  const monaNames = charIds.map(id => {
    const found = monaCatalog.characters.find(c => c.canonicalId === id);
    if (found) return found.monaKey;
    const spec = charSpecs.find(s => s.entity === id);
    return spec?.monaKey ?? null;
  }).filter(Boolean);
  if (monaNames.length) {
    const probes = await probeMonaSkills({ characters: monaNames, constellations: [0] });
    const inv = await monaCalculationInventory({ probes });
    const menus = inv.rows.filter(r => r.kind === 'skill' && monaNames.includes(r.character));
    const discovered = singleHitCandidates(menus, leyline.rows).candidates;
    const scaling = await compareMonaOrdinaryScaling(inv.rows, leyline.rows, discovered, probes.rows);
    const ordinary = await auditMonaOrdinaryBatch(inv.rows, leyline.rows, discovered, scaling, entities, engine);
    ordinarySummary = ordinary.summary;
    ordinaryUnresolved = ordinary.rows.filter(r => r.status !== 'matched').map(r => ({
      mona: r.mona, leyline: r.leyline, status: r.status, reason: r.reason,
    }));
  }
}

const failures = [
  ...compileErrors,
  ...specBuffs.rows.filter(r => !['matched', 'different'].includes(r.status)),
  ...specHits.rows.filter(r => !['matched', 'different'].includes(r.status)),
  ...specFourPiece.rows.filter(r => !['matched', 'different'].includes(r.status)),
];

const elapsedMs = Date.now() - started;
const report = {
  elapsedMs,
  targets: { characters: charIds, weapons: weaponIds, sets: setIds },
  loadedSpecs: { characters: charSpecs.length, weapons: weaponSpecs.length, sets: setSpecs.length },
  compileErrors,
  specBuffs: { summary: specBuffs.summary, rows: specBuffs.rows },
  specHits: { summary: specHits.summary, rows: specHits.rows },
  specFourPiece: { summary: specFourPiece.summary, rows: specFourPiece.rows },
  ordinary: ordinarySummary ? { summary: ordinarySummary, unresolved: ordinaryUnresolved } : null,
  ok: failures.length === 0,
};

if (values.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Mona Entity Bilateral Audit (${elapsedMs} ms) — ${report.ok ? 'PASS' : 'FAIL'}`);
  console.log(`  Buff scenarios:   ${specBuffs.summary.matched} matched, ${specBuffs.summary.different} different, ${specBuffs.summary.open} open`);
  console.log(`  Hit scenarios:    ${specHits.summary.matched} matched, ${specHits.summary.different} different, ${specHits.summary.open} open`);
  console.log(`  Set 4pc scenarios:${specFourPiece.summary.matched} matched, ${specFourPiece.summary.different} different, ${specFourPiece.summary.open} open`);
  if (ordinarySummary) {
    console.log(`  Ordinary C0 hits: ${ordinarySummary.reviewed}/${ordinarySummary.eligible} matched (${ordinarySummary.unresolved} unresolved)`);
  }
  for (const r of specBuffs.rows) {
    console.log(`  [buff:${r.status}] ${r.key} (${r.scenarioId}) ${r.leylineTarget ?? ''}: mona=${r.monaDeltaNormalized?.toFixed?.(6) ?? r.monaDelta} leyline=${r.leylineDelta?.toFixed?.(6) ?? r.leylineDelta}${r.error ? ' ERR: ' + r.error : ''}`);
  }
  for (const r of specHits.rows) {
    const sample = r.cases?.[0];
    console.log(`  [hit:${r.status}] ${r.mona} -> ${r.leyline} (${r.scenarioId}): cases=${r.cases?.length ?? 0} first(mona=${sample?.mona?.toFixed?.(3)}, leyline=${sample?.leyline?.toFixed?.(3)})${r.error ? ' ERR: ' + r.error : ''}`);
  }
  for (const r of specFourPiece.rows) {
    console.log(`  [4pc:${r.status}] ${r.key} (${r.scenarioId}) ${r.leylineTarget ?? ''}: mona=${r.monaDeltaNormalized?.toFixed?.(6) ?? r.monaDelta} leyline=${r.leylineDelta?.toFixed?.(6) ?? r.leylineDelta}${r.error ? ' ERR: ' + r.error : ''}`);
  }
  if (failures.length) {
    console.error('\nFailures:', JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}
