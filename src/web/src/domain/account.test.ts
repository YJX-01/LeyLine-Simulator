import { describe, expect, it } from 'vitest';
import { createAccount, equipArtifact, parseAccount, copyAccountCharacter } from './account';
import { createWorkbenchProject } from './workbench-project';

function populatedAccount() {
  const account = createAccount();
  account.characters.push({ id: 'one', name: '角色甲', attack: 1000, weapon: '武器甲', equipment: {} }, { id: 'two', name: '角色乙', attack: 900, weapon: '武器乙', equipment: {} });
  account.artifacts.push({ id: 'flower-one', name: '同属性花一', slot: 'flower', attack: 100 }, { id: 'flower-two', name: '同属性花二', slot: 'flower', attack: 100 });
  return account;
}
describe('independent local account', () => {
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
