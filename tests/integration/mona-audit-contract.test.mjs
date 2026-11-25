import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyMonaBuffDiagnostic } from '../../tools/lib/mona-calculation-probes.mjs';
import { classifyMonaDifferences } from '../../tools/lib/mona-difference-attribution.mjs';

test('a focused audit preserves a full report at its output path', t => {
  const directory = mkdtempSync(join(tmpdir(), 'leyline-audit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'full.json');
  const original = JSON.stringify({ mona: [], leyline: [], links: [] });
  writeFileSync(path, original);
  const result = spawnSync(process.execPath, ['tools/scripts/data/audit-mona-mechanism.mjs', '--group', 'buff', '--out', path],
    { encoding: 'utf8', timeout: 5000 });
  assert.match(result.stderr, /Cannot replace a full report/);
  assert.equal(readFileSync(path, 'utf8'), original);
});

test('a runtime failure cannot be reclassified as an invalid scenario', () => {
  const comparison = { damage: { error: 'runtime failure' } };
  assert.deepEqual(classifyMonaBuffDiagnostic('DurinC2', 'Bennett', { reaction_element: 1 }, comparison),
    { kind: 'execution-failure', reason: 'runtime failure' });
});

test('a difference remains open without independent evidence', () => {
  const link = { id: 'ordinary-wrong-arm:Kaeya:6', disposition: 'different',
    mona: ['mona:skill:Kaeya:6'], leyline: [{ id: 'hit' }], sources: ['kaeya.rs:170'] };
  const row = { mona: link.mona[0], leyline: 'hit', status: 'different', arm: { path: 'kaeya.rs', line: 170 },
    ratios: Array.from({ length: 15 }, (_, index) => ({ level: index + 1, mona: 2, rust: 2, official: 3 })),
    cases: [1, 6, 10].map(level => ({ level, expected: 10, actual: 10 })) };
  assert.equal(classifyMonaDifferences([link], [row])[0].status, 'attributed');
  assert.equal(classifyMonaDifferences([{ ...link, sources: [] }], [row])[0].status, 'open');
  row.ratios[4].official = 2;
  assert.equal(classifyMonaDifferences([link], [row])[0].status, 'open');
});

test('reaction attribution requires the complete, consistent two-sided observations', () => {
  const file = new URL('../../tools/data/sources/mona-community/589ac6919057709924c0c20d5a9d673fe9b0be1a/transformative-comparison.json', import.meta.url);
  const link = JSON.parse(readFileSync(file, 'utf8')).mappings.find(row => row.id === 'transformative-overload');
  const target = { ...link.leyline[0], binding: { identity: { id: 'attribute.reaction.overloaded.coefficient' } } };
  const inputs = [1, 50, 90].flatMap(level => [0, 20].flatMap(em => [-.2, .1, .8].map(resistance => ({ level, em, resistance }))));
  inputs.push({ level: 90, em: 0, resistance: -.2 });
  const multipliers = JSON.parse(readFileSync(new URL('../../src/game-data/data/calculation/reactions.json', import.meta.url), 'utf8')).rules.levelMultipliers;
  const rows = inputs.map(input => {
    const factor = input.resistance < 0 ? 1 - input.resistance / 2 : input.resistance < .75 ? 1 - input.resistance : 1 / (4 * input.resistance + 1);
    const independent = multipliers[input.level] * 2.75 * (1 + 16 * input.em / (2000 + input.em)) * factor;
    return { ...input, key: 'overload', element: 'pyro', coefficient: 2.75,
      independent, leyline: independent, mona: independent * 2 / 2.75, status: 'mismatch',
      attribution: { cause: '5.2-reaction-coefficient' } };
  });
  const classify = observed => classifyMonaDifferences([link], [], { rows: observed }, [target])[0].status;
  assert.equal(classify([]), 'open');
  assert.equal(classify(rows), 'attributed');
  assert.equal(classify(rows.slice(1)), 'open');
  const changed = structuredClone(rows);
  changed[0].mona *= 1.1;
  assert.equal(classify(changed), 'open');
  changed[0] = { ...rows[0], independent: rows[0].independent * 2, leyline: rows[0].leyline * 2, mona: rows[0].mona * 2 };
  assert.equal(classify(changed), 'open');
});
