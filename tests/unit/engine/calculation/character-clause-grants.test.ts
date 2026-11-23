import { describe, expect, it } from 'vitest';
import * as engine from '@leyline/engine';
import { getCharacter, getWeapon } from '@leyline/game-data';
import { auditCharacterClauseGrants, characterClauseAuditIds } from '../../../../tools/lib/character-clause-grants-audit.mjs';

describe('single-hit character clauses and granted modifiers', () => {
  it('independently evaluates the recorded conditions, recipients and unlock ranks', async () => {
    const characters = await Promise.all(characterClauseAuditIds.map(id => getCharacter(id)));
    const weapons = await Promise.all(['dullblade', 'beginnersprotector', 'apprenticesnotes', 'wastergreatsword', 'huntersbow']
      .map(id => getWeapon(id)));
    const result = auditCharacterClauseGrants({ characters, weapons }, engine);
    expect(result.rows.filter(row => row.issue)).toEqual([]);
    expect(result.verified).toContain('albedo/constellations/3');
    expect(result.verified).toContain('yelan/constellations/1');
    const nightrider = result.rows.filter(row =>
      row.entity === 'fischl' && row.field === '/constellations/1' && 'unlocked' in row.settings && row.settings.unlocked);
    expect(nightrider).toEqual([
      expect.objectContaining({ settings: expect.objectContaining({ hit: 'fischl.skill.param2' }), value: 2480 }),
      expect.objectContaining({ settings: expect.objectContaining({ hit: 'fischl.skill.param1' }), value: 0 }),
    ]);
  }, 15000);
});
