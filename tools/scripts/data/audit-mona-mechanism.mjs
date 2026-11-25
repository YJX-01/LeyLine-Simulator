import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createRuntimeCatalog } from '../../lib/runtime-catalog.mjs';
import { loadContentSchema } from '../../lib/load-content-schema.mjs';
import { probeMonaBuffs, probeMonaSkills } from '../../lib/mona-calculation-probes.mjs';
import { monaCalculationInventory } from '../../lib/mona-calculation-inventory.mjs';
import { leylineSingleHitInventory } from '../../lib/leyline-single-hit-inventory.mjs';
import { auditWorktree, readReviews, reviewLinks, singleHitCandidates } from '../../lib/mona-single-hit-comparison.mjs';
import { readContentSource } from '../../lib/content-source.mjs';
import { compareMonaOrdinaryScaling } from '../../lib/mona-ordinary-scaling.mjs';
import { auditMonaCommonInputBranches } from '../../lib/mona-common-input-batch.mjs';
import { auditMonaOrdinaryBatch } from '../../lib/mona-ordinary-batch.mjs';
import { auditMonaWrongOrdinaryArms } from '../../lib/mona-ordinary-wrong-arms.mjs';
import { auditMonaBuffScenarios } from '../../lib/mona-character-buff-batch.mjs';
import { auditMonaTransformative, validateMonaTransformativeReviews } from '../../lib/mona-transformative-audit.mjs';
import { classifyMonaDifferences } from '../../lib/mona-difference-attribution.mjs';

const { values } = parseArgs({ options: { group: { type: 'string' }, character: { type: 'string', multiple: true }, 'buff-key': { type: 'string', multiple: true }, out: { type: 'string' } } });
if (!['buff', 'damage', 'differences'].includes(values.group) || !values.out) throw new Error('Use --group buff|damage|differences --out <partial.json>; damage requires --character <Mona name> (repeatable).');
if (values.group === 'damage' && !values.character?.length) throw new Error('Damage requires at least one --character; this prevents an accidental all-roster run.');
const output = resolve(values.out);
function assertPartialDestination() {
  if (!existsSync(output)) return;
  let previous;
  try { previous = JSON.parse(readFileSync(output, 'utf8')); } catch { throw new Error('Existing output is not a partial report: ' + output); }
  if (previous.kind !== 'mona-mechanism-partial') throw new Error('Cannot replace a full report or another file: ' + output);
}
assertPartialDestination();
const expectedMona = readContentSource('tools/data/references.json').repositories.find(row => row.id === 'mona-community').commit;
const mona = auditWorktree('.references/mona-community');
if (mona.revision !== expectedMona) throw new Error('Fixed Mona checkout required: ' + expectedMona + '; found ' + mona.revision);
const runtime = '.references/mona-community/beta-tools/runtime-7106.mjs';
const runtimeSha256 = createHash('sha256').update(readFileSync(runtime)).digest('hex');
const local = auditWorktree('.');
const catalog = await createRuntimeCatalog(), engine = await loadContentSchema('/src/engine/src/index.ts');
const entities = { characters: [], weapons: [], sets: [] };
for (const [group, entries] of Object.entries(entities)) for (const id of catalog.inventory[group]) entries.push(await catalog.get(group, id));
const report = { kind: 'mona-mechanism-partial', group: values.group, generatedAt: new Date().toISOString(),
  versions: { monaCheckout: mona.revision, monaWorktree: mona.worktree, monaRuntimeSha256: runtimeSha256,
    leylineHead: local.revision, leylineDirty: local.dirty, leylineWorktree: local.worktree },
  discovery: { leyline: 'live formal catalog and revisions', mona: 'fixed checkout metadata', reusedInventory: false },
  limitations: ['Partial mechanism run; not a full coverage report. Live catalog binding IDs and revisions are regenerated, not taken from an older report.'] };
if (values.group === 'buff') {
  report.discovery.buffKeys = values['buff-key'] ?? ['DurinC2', 'DurinTalent2', 'LinneaC1'];
  report.buffContexts = await probeMonaBuffs({ keys: report.discovery.buffKeys });
  report.buff = await auditMonaBuffScenarios(entities, engine, values['buff-key']);
} else {
  const leyline = await leylineSingleHitInventory(entities);
  const selected = values.character ?? ['Kaeya', 'Rosaria'];
  const probes = await probeMonaSkills({ characters: selected, constellations: [0] });
  const inventory = await monaCalculationInventory({ probes });
  const selectedIds = new Set(inventory.rows.filter(row => row.kind === 'skill' && selected.includes(row.character)).map(row => row.id));
  const discovered = singleHitCandidates(inventory.rows, leyline.rows).candidates;
  const candidates = new Map([...discovered].filter(([id]) => selectedIds.has(id)));
  const scaling = await compareMonaOrdinaryScaling(inventory.rows, leyline.rows, candidates, probes.rows);
  report.discovery.characters = selected;
  report.discovery.candidateSkills = candidates.size;
  report.scaling = scaling;
  if (values.group === 'damage') {
    report.damage = await auditMonaOrdinaryBatch(inventory.rows, leyline.rows, candidates, scaling, entities, engine);
    const initial = [...readReviews().filter(review => review.mona?.some(id => selectedIds.has(id)
      || selected.some(name => id.startsWith('mona:branch:' + name + ':')))), ...report.damage.mappings];
    const issues = [];
    const accepted = reviewLinks(initial, new Map(inventory.rows.map(row => [row.id, row])),
      new Map(leyline.rows.map(row => [row.id, row])), issues);
    report.reviewIssues = issues;
    report.commonInputs = await auditMonaCommonInputBranches(inventory.rows, leyline.rows, accepted, entities, engine);
  } else {
    const wrongArms = await auditMonaWrongOrdinaryArms(inventory.rows, leyline.rows, candidates, scaling, entities, engine);
    const transformative = await auditMonaTransformative(entities, engine);
    const reviewFile = 'tools/data/sources/mona-community/' + expectedMona + '/transformative-comparison.json';
    const reviews = JSON.parse(readFileSync(reviewFile, 'utf8')).mappings;
    const validated = validateMonaTransformativeReviews(reviews, transformative, leyline.rows);
    report.transformative = transformative;
    report.transformativeReviews = validated;
    report.wrongArms = wrongArms;
    report.differences = classifyMonaDifferences([...validated.reviews, ...wrongArms.mappings], wrongArms.rows, transformative, leyline.rows);
    report.limitations.push('Other known mapping families are not re-run or counted in this focused differences report.');
  }
}
const temporary = output + '.' + randomUUID() + '.tmp';
try {
  writeFileSync(temporary, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  assertPartialDestination();
  renameSync(temporary, output);
} finally { if (existsSync(temporary)) unlinkSync(temporary); }
console.log(JSON.stringify({ output, group: report.group, discovery: report.discovery }));
