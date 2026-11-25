import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const paths = process.argv.slice(2);
if (paths.length !== 2) throw new Error('用法: node tools/scripts/data/report-mona-progress.mjs 上次报告.json 本次报告.json');
const [previous, current] = paths.map(path => JSON.parse(readFileSync(resolve(path), 'utf8')));
if (previous.baselines.mona !== current.baselines.mona || previous.baselines.leyline !== current.baselines.leyline) {
  throw new Error('两份报告的起始目录版本不同。');
}
const change = (before, after) => {
  const previousIds = new Set(before), currentIds = new Set(after);
  const added = [...currentIds].filter(id => !previousIds.has(id));
  const removed = [...previousIds].filter(id => !currentIds.has(id));
  return { before: previousIds.size, added, removed, after: currentIds.size };
};
const report = { reports: { previous: paths[0], current: paths[1] }, baselines: current.baselines, batches: current.summary.batches, pending: {} };
for (const side of ['mona', 'leyline']) {
  const delta = change(previous.gaps[side], current.gaps[side]);
  const priorRows = new Map(previous[side].map(row => [row.id, row]));
  const rows = new Map(current[side].map(row => [row.id, row]));
  report.pending[side] = {
    before: delta.before, added: delta.added.length, removed: delta.removed.length, after: delta.after,
    newlyEnumeratedPending: delta.added.filter(id => !priorRows.has(id)).length,
    reopened: delta.added.filter(id => priorRows.has(id)).length,
    reviewed: delta.removed.filter(id => rows.get(id)?.status === 'reviewed').length,
    reference: delta.removed.filter(id => rows.get(id)?.status === 'reference').length,
    absent: delta.removed.filter(id => !rows.has(id)).length,
  };
}
const links = change(previous.links.map(row => row.id), current.links.map(row => row.id));
report.mappings = { before: links.before, added: links.added.length, removed: links.removed.length, after: links.after };
report.issues = current.gaps.issues;
report.complete = current.summary.complete;
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
