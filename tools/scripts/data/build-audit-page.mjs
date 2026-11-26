import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { buildEvidence, buildInventory, summarizeMappings } from '../../lib/audit-page-data.mjs';
import { buildBehaviorLedger, reconcileBehaviors, facetNames, gapNames } from '../../lib/mona-behavior-ledger.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const auditPackage = resolve(root, 'tools/mona-audit');
const output = resolve(root, 'artifacts/mona-audit-site/data');
mkdirSync(output, { recursive: true });
const { values } = parseArgs({ options: { report: { type: 'string' }, 'previous-report': { type: 'string' } } });
const reportFile = resolve(root, values.report ?? 'artifacts/mona-audit-current.json');
const indexPath = resolve(output, 'index.json');
const published = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : null;
function publishBaseline(rawPath) {
  const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
  return publishChunk('behavior', JSON.stringify(reconcileBehaviors(buildBehaviorLedger(raw))) + '\n');
}
function publishChunk(prefix, content) {
  const filename = prefix + '-' + createHash('sha256').update(content).digest('hex').slice(0, 20) + '.json';
  const path = resolve(output, filename);
  if (!existsSync(path)) {
    const temporary = path + '.' + randomUUID();
    writeFileSync(temporary, content);
    renameSync(temporary, path);
  }
  return filename;
}
// On migration, capture the last real report before replacing it with a fresh run.
let baselineFile = published?.coverage?.file;
if (values['previous-report']) baselineFile = publishBaseline(resolve(root, values['previous-report']));
else if (!baselineFile && !values.report && existsSync(reportFile)) baselineFile = publishBaseline(reportFile);
if (!values.report) {
  const pendingReport = reportFile + '.' + randomUUID();
  const audit = spawnSync(process.execPath, ['tools/scripts/data/audit-calculation-coverage.mjs', '--mona-report', pendingReport], {
    cwd: root, stdio: 'inherit',
  });
  if (audit.error) throw audit.error;
  if (![0, 1].includes(audit.status) || !existsSync(pendingReport)) throw new Error('审计中断，未生成新的完整报告。');
  if (audit.status === 1) {
    const incomplete = JSON.parse(readFileSync(pendingReport, 'utf8'));
    incomplete.gaps.issues.push({ issue: '目录验收仍有失败项，详见此次审计命令的输出。' });
    writeFileSync(pendingReport, JSON.stringify(incomplete) + '\n');
  }
  renameSync(pendingReport, reportFile);
}
const reportBytes = readFileSync(reportFile);
const digest = createHash('sha256').update(reportBytes).digest('hex');
const report = JSON.parse(reportBytes.toString('utf8'));
if (!Array.isArray(report.mona) || !Array.isArray(report.leyline) || !Array.isArray(report.links)) {
  throw new Error('输入文件缺少双向审计目录或映射。');
}
const inventory = buildInventory(report);
const evidenceFor = buildEvidence(report);
const sideNames = ['mona', 'leyline'];
const sourceIndex = new Map();
const shownIds = new Set();
for (const row of inventory) {
  if (shownIds.has(row.id)) throw new Error('展示行 ID 冲突 ' + row.id);
  shownIds.add(row.id);
  for (const id of row.sourceIds) {
    if (sourceIndex.has(id)) throw new Error('原始条目重复归并 ' + id);
    sourceIndex.set(id, row);
  }
}
for (const side of sideNames) {
  for (const item of report[side]) {
    if (sourceIndex.get(item.id)?.side !== side) throw new Error('未收录原始条目 ' + item.id);
  }
}
const previous = published?.summary;
if (!values['previous-report'] && published?.coverage?.reportDigest === digest) baselineFile = published.coverage.baselineFile;
const baseline = baselineFile ? JSON.parse(readFileSync(resolve(output, baselineFile), 'utf8')) : null;
const ledger = buildBehaviorLedger(report, inventory, evidenceFor);
const round = reconcileBehaviors(ledger, baseline);
const coverage = { file: publishChunk('behavior', JSON.stringify(round) + '\n'), baselineFile, reportDigest: digest, totals: round.totals,
  complete: round.complete, baseline: round.baseline, batches: round.batches, owners: round.ownerCounts, productChanges: round.productChanges,
  facets: facetNames, gaps: gapNames };
const differenceById = ledger.attribution;
const sides = Object.fromEntries(sideNames.map(side => [side, {
  raw: report[side].length, rows: 0, damage: 0, buff: 0, unknown: 0,
  passed: 0, failed: 0, unverified: 0, comparable: 0, matched: 0, different: 0,
}]));
const limits = report.limitations ?? [];
const summary = { sides, ...summarizeMappings(report), issues: report.gaps?.issues ?? [], limitations: limits, delta: null,
  attributedMappings: [...differenceById.values()].filter(item => item.status === 'attributed').length,
  attributedScenarios: (report.transformative?.rows ?? []).filter(item => differenceById.get('transformative-' + item.key)?.status === 'attributed').length };
const rows = [];
let pending = [], bytes = 0;
function flush() {
  if (!pending.length) return;
  const content = '{' + pending.map(entry => JSON.stringify(entry.row.id) + ':' + entry.detail).join(',') + '}\n';
  const chunk = publishChunk('detail', content);
  for (const entry of pending) entry.row.chunk = chunk;
  pending = [];
  bytes = 0;
}
function resolveTargets(refs, side) {
  const targets = refs.map(ref => sourceIndex.get(typeof ref === 'string' ? ref : ref.id));
  return [...new Set(targets.filter(row => row?.side === side))];
}
const reference = row => ({ id: row.id, name: row.entityName + ' · ' + row.name, side: row.side });
for (const row of inventory) {
  const { run, comparison, links, candidates, details } = evidenceFor(row);
  const other = row.side === 'mona' ? 'leyline' : 'mona';
  const counterparts = resolveTargets(links.flatMap(link => link[other]), other);
  const candidateRows = resolveTargets(candidates, other).filter(target => !counterparts.includes(target));
  const implementation = row.side === 'leyline' ? row.implementation :
    counterparts.find(target => target.implementation)?.implementation ?? '';
  const entry = { id: row.id, side: row.side, category: row.category, name: row.name, entity: row.entity,
    entityName: row.entityName, mechanism: row.mechanism, featureText: row.featureText,
    roles: [...new Set(row.sourceIds.map(id => ledger.assignments.get(id).role))], implementation, run, comparison, chunk: '' };
  const detail = JSON.stringify({ features: row.features, source: row.sourcePath, sourceIds: row.sourceIds,
    raw: row.source, links, candidates, counterparts: counterparts.map(reference), candidateRows: candidateRows.map(reference), details,
    attribution: links.map(link => differenceById.get(link.id)).filter(Boolean),
    assignments: row.sourceIds.map(id => ({ id, ...ledger.assignments.get(id) })) });
  const size = Buffer.byteLength(detail);
  if (bytes + size > 512 * 1024) flush();
  pending.push({ row: entry, detail });
  rows.push(entry);
  bytes += size;
  const stats = sides[row.side];
  stats.rows++;
  stats[row.category]++;
  stats[run === '已跑通' ? 'passed' : run === '执行失败' ? 'failed' : 'unverified']++;
  if (comparison === '一致' || comparison === '有差异') {
    stats.comparable++;
    stats[comparison === '一致' ? 'matched' : 'different']++;
  }
}
flush();
function difference(current, before) {
  return Object.fromEntries(Object.entries(current)
    .filter(([key, n]) => Number.isFinite(n) && Number.isFinite(before[key]))
    .map(([key, n]) => [key, n - before[key]]));
}
if (previous?.sides && previous.comparisons && previous.scenarios) {
  summary.delta = Object.fromEntries(sideNames.map(side => [side, difference(sides[side], previous.sides[side])]));
  for (const key of ['mappings', 'comparisons', 'scenarios', 'direct']) {
    if (previous[key]) summary.delta[key] = difference(summary[key], previous[key]);
  }
}
const provenance = report.provenance;
const index = {
  versions: { mona: provenance ? provenance.mona : report.baselines.mona, leyline: provenance?.leyline ?? null },
  generatedAt: provenance?.generatedAt ?? statSync(reportFile).mtime.toISOString(),
  dirty: provenance?.dirty ?? null, worktree: provenance?.worktree, summary, rows, coverage,
};
// Publish the index last so readers can finish loading their previous snapshot.
const vite = resolve(dirname(createRequire(resolve(auditPackage, 'package.json')).resolve('vite/package.json')), 'bin/vite.js');
execFileSync(process.execPath, [vite, 'build'], { cwd: auditPackage, stdio: 'inherit' });
const temporary = indexPath + '.' + randomUUID();
writeFileSync(temporary, JSON.stringify(index) + '\n');
renameSync(temporary, indexPath);
console.log(JSON.stringify({ sides, mappings: summary.mappings, comparisons: summary.comparisons, scenarios: summary.scenarios, behaviors: round.totals, complete: round.complete }));
