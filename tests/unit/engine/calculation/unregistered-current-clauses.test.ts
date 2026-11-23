import { describe, expect, it } from 'vitest';
import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { auditUnregisteredCurrentClauses, unregisteredCurrentClauseIds } from '../../../../tools/lib/unregistered-current-clauses.mjs';

describe('single-hit and attribute clauses without previous direct bindings', () => {
  it('matches fixed-source expectations for unlocked, disabled and out-of-scope conditions', async () => {
    const [characters, weapons] = await Promise.all([
      Promise.all(unregisteredCurrentClauseIds.map(id => getCharacter(id))),
      Promise.all(['dullblade', 'beginnersprotector', 'huntersbow', 'wastergreatsword', 'apprenticesnotes', 'favoniussword',
        'favoniuswarbow', 'ferrousshadow', 'sacrificialfragments'].map(id => getWeapon(id))),
    ]);
    const result = auditUnregisteredCurrentClauses({ characters, weapons }, engine);
    expect(result.rows.filter(row => row.issue)).toEqual([]);
    expect(result.verified).toEqual(new Set([
      'bennett/constellations/3', 'chongyun/constellations/0', 'venti/constellations/0', 'tighnari/constellations/5',
      'kujousara/constellations/1', 'raidenshogun/constellations/1', 'jean/constellations/3', 'sucrose/passives/1',
      'aether-anemo/constellations/5', 'lumine-anemo/constellations/5', 'aether-electro/constellations/5', 'lumine-electro/constellations/5',
    ]));
    expect(result.gaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity: 'dahlia', field: '/constellations/5' }),
      expect.objectContaining({ entity: 'nicole', field: '/constellations/5' }),
    ]));
    expect(result.timing).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity: 'aether-electro', field: '/constellations/5' }),
    ]));
    expect(result.indirect).toEqual(expect.arrayContaining([
      expect.objectContaining({ entity: 'bennett', field: '/constellations/0' }),
    ]));
  }, 20000);
});
