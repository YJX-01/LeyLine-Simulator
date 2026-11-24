import { describe, expect, it } from 'vitest';
import { createAccount } from '../../src/web/src/domain/account';
import { confirmEnkaImport, previewEnkaImport } from '../../src/web/src/domain/enka-import';

function avatar(avatarId: number, skillDepotId: number, skills: number[]) {
  return { avatarId, skillDepotId, propMap: { '4001': { val: '80' }, '1002': { val: '5' } },
    skillLevelMap: Object.fromEntries(skills.map((id, index) => [id, index + 2])),
    equipList: [{ itemId: 11101, flat: { rankLevel: 1, itemType: 'ITEM_WEAPON', icon: '' }, weapon: { level: 1, promoteLevel: 0 } }] };
}

describe('Enka multi-form characters', () => {
  it('preserves both imported manekin forms in one account', async () => {
    const account = createAccount();
    for (const [depot, burst, id] of [[11702, 111751, 'manekin-pyro'], [11705, 111754, 'manekin-cryo']] as const) {
      const result = await previewEnkaImport({ playerInfo: {}, avatarInfoList: [avatar(10000117, depot, [11171, 11172, burst])] }, '123456789', account);
      expect(result.skipped).toEqual([]);
      expect(result.rows.map(row => row.character.build?.character.id)).toEqual([id]);
      confirmEnkaImport(account, result, [result.rows[0].character.id]);
    }
    expect(account.characters.map(character => character.build?.character.id)).toEqual(['manekin-pyro', 'manekin-cryo']);
  });

  it('reports a base form and missing talent level separately', async () => {
    const account = createAccount();
    const inputs = [avatar(10000117, 11701, [11171]), avatar(10000117, 11702, [11171, 11172])];
    const result = await previewEnkaImport({ playerInfo: {}, avatarInfoList: inputs }, '123456789', account);
    expect(result.rows).toEqual([]);
    expect(result.skipped).toEqual([expect.stringContaining('无法表达不存在的天赋'), expect.stringContaining('缺少天赋等级')]);
  });

  it('skips an unknown traveler form while importing the following known form', async () => {
    const account = createAccount();
    const inputs = [avatar(10000007, 799, [100554, 10127, 10128]), avatar(10000007, 705, [100554, 10127, 10128])];
    const result = await previewEnkaImport({ playerInfo: {}, avatarInfoList: inputs }, '123456789', account);
    expect(result.skipped).toEqual([expect.stringContaining('799')]);
    expect(result.rows.map(row => row.character.build?.character.id)).toEqual(['lumine-cryo']);
    confirmEnkaImport(account, result, [result.rows[0].character.id]);
    expect(account.characters.map(character => character.build?.character.id)).toEqual(['lumine-cryo']);
  });
});
