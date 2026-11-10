import { accountSchema, type AccountSlot, type LocalAccount, type AccountCharacter, type Project } from '@leyline/schema';
import { validateAccountArtifact } from './account-real';

export { accountSlots, type AccountSlot, type AccountArtifact, type AccountCharacter, type LocalAccount } from '@leyline/schema';
export const accountSlotLabels: Record<AccountSlot,string>={flower:'生之花',plume:'死之羽',sands:'时之沙',goblet:'空之杯',circlet:'理之冠'};
export const cloneAccount = (value: LocalAccount): LocalAccount => JSON.parse(JSON.stringify(value)) as LocalAccount;
export function createAccount(name = '我的本地账号'): LocalAccount {
  return { schemaVersion: 2, kind: 'account', id: crypto.randomUUID(), name, characters: [], artifacts: [] };
}
export function parseAccount(input:unknown):LocalAccount {
 const parsed=accountSchema.safeParse(input);
 if(!parsed.success)throw new Error('账号文件格式或装备归属无效，现有账号保持不变。');
 for(const item of parsed.data.artifacts)if(item.real)validateAccountArtifact(item.real);
 return cloneAccount(input as LocalAccount);
}
export function artifactOwners(account: LocalAccount, artifactId: string): AccountCharacter[] {
  return account.characters.filter(character => Object.values(character.equipment).includes(artifactId));
}
export function equipArtifact(account: LocalAccount, characterId: string, artifactId: string): void {
  const character = account.characters.find(entry => entry.id === characterId);
  const artifact = account.artifacts.find(entry => entry.id === artifactId);
  if (!character || !artifact) throw new Error('角色或圣遗物不存在。');
  character.equipment[artifact.slot] = artifactId;
}
export function copyAccountCharacter(account: LocalAccount, characterId: string, project: Project, characterDefinition: string, weaponDefinition: string): string {
  parseAccount(account);
  const character = account.characters.find(entry => entry.id === characterId);
  if (character && (character.build || Object.values(character.equipment).some(id => account.artifacts.find(item => item.id === id)?.real))) throw new Error('真实角色或真实圣遗物请通过真实配装面板复制到当前轴，避免丢失技能、装备及数据快照。');
  if (!character || !project.definitions.some(entry => entry.id === characterDefinition) || !project.definitions.some(entry => entry.id === weaponDefinition)) throw new Error('请先选择账号角色和轴内角色、武器定义。');
  const artifacts = Object.values(character.equipment).map(item => ({ ...account.artifacts.find(entry => entry.id === item)! }));
  const occupied = new Set(project.candidate.actors.flatMap(actor => actor.accountSnapshot?.accountId === account.id ? actor.accountSnapshot.artifacts.map(item => item.id) : []));
  if (artifacts.some(item => occupied.has(item.id))) throw new Error('当前队伍已使用该角色的实物圣遗物，不能重复占用。请先调整轴内候选装备。');
  const id = crypto.randomUUID();
  const equipmentAttack = artifacts.reduce((sum, item) => sum + item.attack, 0);
  project.candidate.actors.push({ id, name: character.name, character: characterDefinition, weapon: weaponDefinition, inputs: { attack: { value: character.attack + equipmentAttack, unit: 'attack' } }, accountSnapshot: { accountId: account.id, characterId: character.id, weapon: character.weapon, artifacts } });
  return id;
}
