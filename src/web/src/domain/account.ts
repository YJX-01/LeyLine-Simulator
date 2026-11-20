import { APP_VERSION } from '@leyline/schema/version';
import { accountSchema, type AccountSlot, type LocalAccount, type AccountCharacter } from '@leyline/schema';
import { validateAccountArtifact } from './account-real';

export { accountSlots, type AccountSlot, type AccountArtifact, type AccountCharacter, type LocalAccount } from '@leyline/schema';
export const accountSlotLabels: Record<AccountSlot,string>={flower:'生之花',plume:'死之羽',sands:'时之沙',goblet:'空之杯',circlet:'理之冠'};
export const cloneAccount = (value: LocalAccount): LocalAccount => JSON.parse(JSON.stringify(value)) as LocalAccount;
export function createAccount(name = '我的本地账号'): LocalAccount {
  return { schemaVersion: APP_VERSION, kind: 'account', id: crypto.randomUUID(), name, characters: [], artifacts: [] };
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
