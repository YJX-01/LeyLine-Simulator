import { describe, expect, it } from 'vitest';
import { createAccount, equipArtifact, parseAccount, copyAccountCharacter } from './account';
import { createWorkbenchProject } from './workbench-project';
import { getRealCharacter, getRealWeapon, getArtifactMain, REAL_DATA_VERSION } from '@leyline/game-data/real';
import type { RealBuild } from '@leyline/schema';

function populatedAccount() {
  const account = createAccount();
  account.characters.push({ id: 'one', name: '角色甲', attack: 1000, weapon: '武器甲', equipment: {} }, { id: 'two', name: '角色乙', attack: 900, weapon: '武器乙', equipment: {} });
  account.artifacts.push({ id: 'flower-one', name: '同属性花一', slot: 'flower', attack: 100 }, { id: 'flower-two', name: '同属性花二', slot: 'flower', attack: 100 });
  return account;
}
describe('independent local account', () => {
  it('roundtrips real game snapshots without sharing mutable data and blocks legacy copying of real gear', async () => {
    const account = populatedAccount();
    const build: RealBuild = { dataVersion: REAL_DATA_VERSION, character: await getRealCharacter('jean'), weapon: await getRealWeapon('favoniussword'), artifactMain: await getArtifactMain(), sets: [], level: 90, ascension: 6, constellation: 0, talents: { normal: 9, skill: 9, burst: 9 }, weaponLevel: 90, weaponAscension: 6, refinement: 1, hpRatio: 1, artifacts: [] };
    account.characters[0].realBuild = build;
    account.artifacts[0].real = { id: 'flower-one', setId: 'none', slot: 'flower', rarity: 5, level: 20, mainStat: 'hp', substats: [{ stat: 'critRate', value: 0.0311 }] };
    equipArtifact(account, 'one', 'flower-one');
    const restored = parseAccount(JSON.parse(JSON.stringify(account)));
    expect(restored.characters[0].realBuild?.character.id).toBe('jean');
    expect(restored.artifacts[0].real?.substats[0].value).toBe(0.0311);
    restored.characters[0].realBuild!.character.base.attack = 1;
    expect(account.characters[0].realBuild.character.base.attack).toBe(18.62);
    expect(() => copyAccountCharacter(account, 'one', createWorkbenchProject(), 'synthetic-character', 'weapon-a')).toThrow('真实配装面板');
    delete account.characters[0].realBuild;
    expect(() => copyAccountCharacter(account, 'one', createWorkbenchProject(), 'synthetic-character', 'weapon-a')).toThrow('真实配装面板');
    restored.artifacts[0].real!.slot = 'plume';
    expect(() => parseAccount(restored)).toThrow('账号文件');
  });
  it('preserves instance identities and requires explicit transfer confirmation', () => {
    const account = populatedAccount();
    equipArtifact(account, 'one', 'flower-one');
    expect(() => equipArtifact(account, 'two', 'flower-one')).toThrow('需要确认');
    expect(account.characters[0].equipment.flower).toBe('flower-one');
    expect(account.characters[1].equipment.flower).toBeUndefined();
    equipArtifact(account, 'two', 'flower-two');
    equipArtifact(account, 'two', 'flower-one', true);
    expect(account.characters[0].equipment.flower).toBeUndefined();
    expect(account.characters[1].equipment.flower).toBe('flower-one');
    expect(parseAccount(JSON.parse(JSON.stringify(account))).artifacts.map(item => item.id)).toEqual(['flower-one', 'flower-two']);
  });
  it('rejects duplicate occupancy, mismatched slots and illegal values', () => {
    const account = populatedAccount();
    account.characters[0].equipment.flower = 'flower-one';
    account.characters[1].equipment.flower = 'flower-one';
    expect(() => parseAccount(account)).toThrow();
    delete account.characters[1].equipment.flower;
    account.characters[0].equipment.plume = 'flower-one';
    expect(() => parseAccount(account)).toThrow();
    delete account.characters[0].equipment.plume;
    account.artifacts[0].attack = NaN;
    expect(() => parseAccount(account)).toThrow();
  });
  it('copies normalized loadout input without sharing mutations with account or old axis', () => {
    const account = populatedAccount();
    equipArtifact(account, 'one', 'flower-one');
    const project = createWorkbenchProject();
    const old = JSON.stringify(project);
    const id = copyAccountCharacter(account, 'one', project, 'synthetic-character', 'weapon-a');
    const copied = project.candidate.actors.find(actor => actor.id === id)!;
    expect(copied.inputs.attack.value).toBe(1100);
    expect(copied.accountSnapshot).toEqual({ accountId: account.id, characterId: 'one', weapon: '武器甲', artifacts: [{ id: 'flower-one', name: '同属性花一', slot: 'flower', attack: 100 }] });
    copied.inputs.attack.value = 5000;
    expect(account.characters[0].attack).toBe(1000);
    account.characters[0].attack = 50;
    account.artifacts[0].attack = 0;
    expect(copied.accountSnapshot?.artifacts[0].attack).toBe(100);
    copied.accountSnapshot!.artifacts[0].name = '轴内快照';
    expect(account.artifacts[0].name).toBe('同属性花一');
    expect(copied.inputs.attack.value).toBe(5000);
    expect(JSON.stringify({ ...project, candidate: { ...project.candidate, actors: project.candidate.actors.slice(0, 1) } })).toBe(old);
  });
  it('rejects repeated physical inventory in a team without partially modifying the axis', () => {
    const account = populatedAccount();
    equipArtifact(account, 'one', 'flower-one');
    const project = createWorkbenchProject();
    copyAccountCharacter(account, 'one', project, 'synthetic-character', 'weapon-a');
    const before = JSON.stringify(project);
    expect(() => copyAccountCharacter(account, 'one', project, 'synthetic-character', 'weapon-a')).toThrow('不能重复占用');
    expect(JSON.stringify(project)).toBe(before);
    equipArtifact(account, 'two', 'flower-one', true);
    expect(() => copyAccountCharacter(account, 'two', project, 'synthetic-character', 'weapon-a')).toThrow('不能重复占用');
    account.id = 'another-account';
    expect(() => copyAccountCharacter(account, 'two', project, 'synthetic-character', 'weapon-a')).not.toThrow();
  });
});
