import { realArtifactSchema, realBuildSchema, type RealArtifact, type RealBuild, type WorkbenchProject } from '@leyline/schema';
import { validateAccountArtifact } from './account-real';

export const accountSlots = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const;
export type AccountSlot = typeof accountSlots[number];
export const accountSlotLabels: Record<AccountSlot, string> = { flower: '生之花', plume: '死之羽', sands: '时之沙', goblet: '空之杯', circlet: '理之冠' };
export interface AccountCharacter { id: string; name: string; attack: number; weapon: string; equipment: Partial<Record<AccountSlot, string>>; realBuild?: RealBuild; showcase?: { uid: string; avatarId: number; fetchedAt: string; rawHash: string; build: RealBuild } }
export interface AccountArtifact { id: string; name: string; slot: AccountSlot; attack: number; real?: RealArtifact; mona?: { mainValue: number; omit: boolean; contentHash?: string; equippedBy?: string; sourceSetName?: string; setIdentityPending?: boolean } }
export interface LocalAccount { schemaVersion: 1; kind: 'account'; id: string; name: string; uid?: string; characters: AccountCharacter[]; artifacts: AccountArtifact[] }
export const cloneAccount = (value: LocalAccount): LocalAccount => JSON.parse(JSON.stringify(value)) as LocalAccount;
export function createAccount(name = '我的本地账号'): LocalAccount {
  return { schemaVersion: 1, kind: 'account', id: crypto.randomUUID(), name, characters: [], artifacts: [] };
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const validText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
const attack = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function parseAccount(input: unknown): LocalAccount {
  const fail = (): never => { throw new Error('账号文件格式或装备归属无效，现有账号保持不变。'); };
  if (!object(input) || input.schemaVersion !== 1 || input.kind !== 'account' || !validText(input.id) || !validText(input.name)
    || !Array.isArray(input.characters) || !Array.isArray(input.artifacts) || input.characters.length > 1000 || input.artifacts.length > 10000) return fail();
  if (input.uid !== undefined && (typeof input.uid !== 'string' || !/^\d{9,10}$/.test(input.uid))) return fail();
  const ids = new Set<string>();
  for (const artifact of input.artifacts) {
    if (!object(artifact) || !validText(artifact.id) || ids.has(artifact.id) || !validText(artifact.name) || !accountSlots.includes(artifact.slot as AccountSlot) || !attack(artifact.attack)) return fail();
    ids.add(artifact.id);
    if (artifact.real !== undefined) {
      const parsed = realArtifactSchema.safeParse(artifact.real);
      if (!parsed.success || parsed.data.id !== artifact.id || parsed.data.slot !== artifact.slot) return fail();
      validateAccountArtifact(parsed.data);
    }
    if (artifact.mona !== undefined && (!object(artifact.mona) || !attack(artifact.mona.mainValue) || typeof artifact.mona.omit !== 'boolean' || (artifact.mona.contentHash !== undefined && typeof artifact.mona.contentHash !== 'string') || (artifact.mona.equippedBy !== undefined && !validText(artifact.mona.equippedBy)))) return fail();
    if (object(artifact.mona) && ((artifact.mona.sourceSetName !== undefined && !validText(artifact.mona.sourceSetName)) || (artifact.mona.setIdentityPending !== undefined && typeof artifact.mona.setIdentityPending !== 'boolean'))) return fail();
  }
  const owners = new Set<string>();
  for (const character of input.characters) {
    if (!object(character) || !validText(character.id) || ids.has(character.id) || !validText(character.name) || !attack(character.attack) || typeof character.weapon !== 'string' || character.weapon.length > 160 || !object(character.equipment)) return fail();
    ids.add(character.id);
    if (character.realBuild !== undefined && !realBuildSchema.safeParse(character.realBuild).success) return fail();
    if (character.showcase !== undefined && (!object(character.showcase) || (typeof character.showcase.uid !== 'string' || !/^\d{9,10}$/.test(character.showcase.uid)) || !Number.isInteger(character.showcase.avatarId) || !validText(character.showcase.fetchedAt) || !validText(character.showcase.rawHash) || !/^[a-f0-9]{64}$/.test(character.showcase.rawHash) || !Number.isFinite(Date.parse(String(character.showcase.fetchedAt))) || !realBuildSchema.safeParse(character.showcase.build).success)) return fail();
    for (const [slot, artifactId] of Object.entries(character.equipment)) {
      const artifact = input.artifacts.find((entry: unknown) => object(entry) && entry.id === artifactId);
      if (!accountSlots.includes(slot as AccountSlot) || !object(artifact) || artifact.slot !== slot || typeof artifactId !== 'string' || owners.has(artifactId)) return fail();
      owners.add(artifactId);
    }
  }
  return cloneAccount(input as unknown as LocalAccount);
}
export function artifactOwner(account: LocalAccount, artifactId: string): AccountCharacter | undefined {
  return account.characters.find(character => Object.values(character.equipment).includes(artifactId));
}
export function equipArtifact(account: LocalAccount, characterId: string, artifactId: string, confirmed = false): void {
  const character = account.characters.find(entry => entry.id === characterId);
  const artifact = account.artifacts.find(entry => entry.id === artifactId);
  if (!character || !artifact) throw new Error('角色或圣遗物不存在。');
  const owner = artifactOwner(account, artifactId);
  if (owner && owner.id !== characterId) {
    if (!confirmed) throw new Error(`需要确认：从「${owner.name}」转移「${artifact.name}」给「${character.name}」。`);
    delete owner.equipment[artifact.slot];
  }
  character.equipment[artifact.slot] = artifactId;
}
export function copyAccountCharacter(account: LocalAccount, characterId: string, project: WorkbenchProject, characterDefinition: string, weaponDefinition: string): string {
  parseAccount(account);
  const character = account.characters.find(entry => entry.id === characterId);
  if (character && (character.realBuild || Object.values(character.equipment).some(id => account.artifacts.find(item => item.id === id)?.real))) throw new Error('真实角色或真实圣遗物请通过真实配装面板复制到当前轴，避免丢失技能、装备及数据快照。');
  if (!character || !project.definitions.some(entry => entry.id === characterDefinition) || !project.definitions.some(entry => entry.id === weaponDefinition)) throw new Error('请先选择账号角色和轴内角色、武器定义。');
  const artifacts = Object.values(character.equipment).map(item => ({ ...account.artifacts.find(entry => entry.id === item)! }));
  const occupied = new Set(project.candidate.actors.flatMap(actor => actor.accountSnapshot?.accountId === account.id ? actor.accountSnapshot.artifacts.map(item => item.id) : []));
  if (artifacts.some(item => occupied.has(item.id))) throw new Error('当前队伍已使用该角色的实物圣遗物，不能重复占用。请先调整轴内候选装备。');
  const id = crypto.randomUUID();
  const equipmentAttack = artifacts.reduce((sum, item) => sum + item.attack, 0);
  project.candidate.actors.push({ id, name: character.name, character: characterDefinition, weapon: weaponDefinition, inputs: { attack: { value: character.attack + equipmentAttack, unit: 'attack' } }, accountSnapshot: { accountId: account.id, characterId: character.id, weapon: character.weapon, artifacts } });
  return id;
}
