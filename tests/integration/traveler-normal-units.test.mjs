import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = file => JSON.parse(readFileSync(resolve(root, file), 'utf8'));

test('adopted base-traveler units retain their exact source descriptions and all numeric parameters', () => {
  const source = read('tools/data/sources/anime-game-data/base-and-manekin.json');
  const talentParams = read('tools/data/sources/anime-game-data/talent-params.json');
  const facts = source.travelerNormalUnits;
  for (const id of ['aether', 'lumine']) {
    const character = read(`src/game-data/data/characters/${id}.json`);
    for (const binding of facts.bindings.filter(binding => binding.file.endsWith(`/${id}.json`))) {
      const parameter = character.talents[0].parameters.find(parameter => parameter.id === binding.parameter);
      assert.equal(parameter.unit, 'ratio');
      assert.deepEqual(parameter.values, talentParams[id].combat1[binding.parameter]);
      const text = source.textMap[binding.sourceTextKey];
      assert.ok(text.includes(`{${binding.parameter}:F1P}`));
      const split = text.indexOf('|');
      assert.ok(character.talents[0].details.some(detail => detail.label === text.slice(0, split) && detail.template === text.slice(split + 1)));
    }
  }
});
