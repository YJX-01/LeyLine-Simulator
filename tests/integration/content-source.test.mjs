import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, rmdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseContentSource, readContentSource, writeContentSource } from '../../tools/lib/content-source.mjs';
import { loadContentSchema } from '../../tools/lib/load-content-schema.mjs';

const source = new URL('../../src/game-data/data/tables/artifact-set-short-names.json', import.meta.url);
const original = readFileSync(source, 'utf8');

test('artifact metadata retains names and its evidence record retains the acquisition date', () => {
  const value = readContentSource(fileURLToPath(source));
  assert.equal(value.source, undefined);
  const origins = readContentSource(new URL('../../tools/data/sources/catalog/runtime-table-origins.json', import.meta.url));
  assert.equal(origins['artifact-set-short-names'].source.accessedAt, '2026-11-08');
  assert.equal(value.sets.blizzardstrayer.name, '冰风迷途的勇士');
  assert.equal(value.sets.blizzardstrayer.shortName, '冰套');
  assert.deepEqual(parseContentSource(original), value);
});

test('invalid derivatives of the real source reject comments, trailing commas and non-finite values', () => {
  for (const text of [original + '\n// comment', original.replace(/}\s*$/, ',}'), original.replace('"冰套"', '1e400'), '\uFEFF' + original]) {
    assert.throws(() => parseContentSource(text, 'artifact-set-short-names.json'));
  }
});

test('explicit JSON writes use two spaces and preserve actual source values and order', () => {
  const directory = mkdtempSync(join(tmpdir(), 'leyline-content-'));
  const path = join(directory, 'artifact-set-short-names.json');
  try {
    const value = readContentSource(fileURLToPath(source));
    writeContentSource(path, value);
    assert.equal(readFileSync(path, 'utf8'), JSON.stringify(value, null, 2) + '\n');
    assert.deepEqual(readContentSource(path), value);
  } finally { rmSync(path); rmdirSync(directory); }
});

test('supported and unsupported actual characters use one complete metadata schema', async () => {
  const { characterMetadataSchema } = await loadContentSchema();
  const supported = readContentSource(new URL('../../src/game-data/data/characters/xingqiu.json', import.meta.url));
  const unsupported = readContentSource(new URL('../../src/game-data/data/characters/hutao.json', import.meta.url));
  assert.equal(supported.schemaVersion, unsupported.schemaVersion);
  assert.deepEqual(characterMetadataSchema.parse(supported), supported);
  assert.deepEqual(characterMetadataSchema.parse(unsupported), unsupported);
  assert.ok(supported.talents.some(talent => talent.hits.some(hit => hit.base.length && hit.family !== 'unresolved')));
  assert.ok(Object.values(unsupported.support).every(scope => scope.resolution !== 'complete'));
  const duplicate = structuredClone(supported);
  duplicate.talents.push(duplicate.talents[0]);
  assert.throws(() => characterMetadataSchema.parse(duplicate), /重复/);
});
