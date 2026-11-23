import { describe, expect, it } from 'vitest';
import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { auditCurrentRosterBuffs, currentRosterBuffIds } from '../../../../tools/lib/current-roster-buff-proof.mjs';

describe('current roster character buff proofs', () => {
  it('checks active and excluded recipients, hits, elements, windows, and stack counts against source text', async () => {
    const [characters, weapons] = await Promise.all([
      Promise.all(currentRosterBuffIds.map(id => getCharacter(id))),
      Promise.all(['dullblade', 'beginnersprotector', 'apprenticesnotes', 'wastergreatsword', 'huntersbow'].map(id => getWeapon(id))),
    ]);
    const { rows, verified } = auditCurrentRosterBuffs({ characters, weapons }, engine);

    expect(rows.filter(row => row.issue)).toEqual([]);
    expect(verified).toContain('aether-electro/constellations/1');
    expect(verified).toContain('aloy/passives/1');
    expect(verified).toContain('kaeya/constellations/0');
    expect(verified).toContain('alhaitham/constellations/1/buffs/0/modifiers/0');
    expect(verified).not.toContain('alhaitham/constellations/1');
    expect(verified).toContain('amber/passives/0/buffs/0/modifiers/0');
    expect(verified).not.toContain('amber/passives/0');

    const electroShred = rows.filter(row => row.entity === 'aether-electro' && row.settings.time !== undefined);
    expect(electroShred.find(row => row.settings.time === 7999)?.value).toBeCloseTo(-.15);
    expect(electroShred.find(row => row.settings.time === 8000)?.value).toBe(0);
    const mastery = rows.filter(row => row.entity === 'alhaitham' && row.clause === '/constellations/1');
    expect(mastery.find(row => row.settings.facts?.['alhaitham.mirrorMasteryStacks'] === 4 && !row.settings.recipient)?.value).toBe(200);
    expect(mastery.find(row => row.settings.facts?.['alhaitham.mirrorMasteryStacks'] === 4 && row.settings.recipient === 'peer')?.value).toBe(0);
    const suppression = rows.filter(row => row.entity === 'valeriy' && row.settings.attribute === 'critDamage' && row.settings.rank === 6);
    expect(suppression.find(row => row.settings.element === 'electro' && row.settings.family === 'stellar-conduct' &&
      row.settings.facts?.['valeriy.c6Suppressed'] === true)?.value).toBeCloseTo(.4);
    expect(suppression.find(row => row.settings.element === 'cryo' && row.settings.family === 'stellar-conduct')?.value).toBe(0);
  }, 15000);
});
