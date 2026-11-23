import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { catalogPlugin } from '../../tools/scripts/build/catalog-plugin.mjs';

test('canonical changes invalidate virtual catalog dependencies with client hot reload disabled', () => {
  const watcher = Object.assign(new EventEmitter(), { add() {} });
  const catalog = '\0virtual:leyline-catalog/characters/dehya';
  const sources = [catalog, '/src/pages/DamageCalculator.vue'];
  const invalidated = [];
  const moduleGraph = {
    idToModuleMap: new Map(sources.map(id => [id, { id }])),
    invalidateModule(module) { invalidated.push(module.id); },
  };
  catalogPlugin().configureServer({ watcher, moduleGraph, config: { server: { hmr: false } } });
  watcher.emit('change', resolve('src/web/src/pages/DamageCalculator.vue'));
  assert.deepEqual(invalidated, []);
  for (const event of ['change', 'add', 'unlink']) {
    watcher.emit(event, resolve('src/game-data/data/calculation/common.json'));
    assert.deepEqual(invalidated.splice(0), [catalog]);
  }
});
