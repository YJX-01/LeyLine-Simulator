import * as engine from '@leyline/engine';
import * as schemas from '@leyline/schema';
import { expect, it } from 'vitest';
import { createContentLinker } from '../../../../src/game-data/src/link-content.mjs';
import { assembleCalculationLibrary } from '../../../../tools/lib/calculation-library.mjs';
import { readCalculationData } from '../../../../tools/lib/catalog-data.mjs';
import { auditPartyInfusion } from '../../../../tools/lib/party-infusion-audit.mjs';

const read = (path: string) => readCalculationData(`src/game-data/data/${path}.json`);

it('converts only eligible melee attacks and evaluates explicitly confirmed overlapping infusions', () => {
  const authoredCharacters = ['kaeya', 'amber', 'noelle', 'bennett', 'candace', 'chongyun'].map(id => read(`characters/${id}`));
  const authoredWeapons = ['dullblade', 'huntersbow', 'wastergreatsword', 'beginnersprotector'].map(id => read(`weapons/${id}`));
  const library = assembleCalculationLibrary(read('calculation/common'), read('calculation/reactions'), [...authoredCharacters, ...authoredWeapons]);
  const compiled = engine.compileCalculation(library);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  const linker = createContentLinker({ schemas, collectCalculationRoots: (_, request) => engine.collectCalculationRoots(compiled.program, request), library });
  const characters = authoredCharacters.map(linker.character);
  const weapons = authoredWeapons.map(linker.weapon);
  const result = auditPartyInfusion({ characters, weapons }, engine);
  expect(result.rows.filter(row => row.issue)).toEqual([]);
  expect(result.verified).toEqual(new Set([
    'bennett/constellations/5/partyInfusion', 'candace/talents/2/partyInfusion', 'chongyun/talents/1/partyInfusion',
  ]));
});
