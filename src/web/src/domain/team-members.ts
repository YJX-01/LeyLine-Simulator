import { buildSchema, type Build, type Project } from '@leyline/schema';
import { accountSlots, accountSlotLabels, type AccountArtifact, type LocalAccount } from './account';
import type { AccountConfiguration } from './account-configurations';
import { calculationArtifact } from './build-snapshot';
import { fileSignature } from './file-signature';
import { artifactValueSignature } from './showcase-inventory';

export type TeamMember = Project['candidate']['actors'][number];
export interface TeamConfigurationRef { accountId: string; characterId: string; presetId: string }
export interface TeamSlot { actorId: string; configuration?: TeamConfigurationRef }
export const teamSize = 4;

export function teamMemberName(member: TeamMember): string {
  return member.name ?? member.build?.character.identity.name ?? '队员';
}

export function teamMemberPortrait(member: TeamMember): string | undefined {
  return member.build?.character.derivedFrom?.id ?? member.build?.character.id;
}

/** Existing snapshots can open a source only when one configuration matches their recorded ownership and build. */
export function matchingTeamConfiguration(snapshot: Build | undefined, configurations: readonly AccountConfiguration[]) {
  const accountId = snapshot?.artifacts[0]?.inventory?.accountId;
  if (!snapshot || !accountId) return undefined;
  const cultivation = fileSignature({ ...snapshot, artifacts: [], sets: [] });
  const matches = configurations.filter(({ character, source }) => {
    const build = character.build;
    if (source.id !== accountId || !build || Object.keys(character.equipment).length !== snapshot.artifacts.length) return false;
    if (cultivation !== fileSignature({ ...build, artifacts: [], sets: [] })) return false;
    return snapshot.artifacts.every(piece => {
      const id = character.equipment[piece.slot];
      if (piece.inventory?.accountId !== accountId || piece.inventory.itemId !== id) return false;
      const item = source.artifacts.find(entry => entry.id === id);
      return item?.real && item.inventoryId !== null && !item.mona?.setIdentityPending
        && fileSignature(calculationArtifact(item.real, accountId)) === fileSignature(piece);
    });
  });
  if (matches.length !== 1) return undefined;
  const match = matches[0];
  return { accountId, characterId: match.character.id, presetId: match.presetId } satisfies TeamConfigurationRef;
}

export async function prepareTeamMember(project: Project, account: LocalAccount, characterId: string, source = account) {
  if (source.id !== account.id) throw new Error('请选择当前账号的角色配置。');
  const character = source.characters.find(entry => entry.id === characterId);
  const build = character?.build;
  if (!character || !build) throw new Error('请先在角色库补全该角色的培养与武器。');
  if (source === account && character.showcase && !Object.values(character.equipment).length && character.showcase.build.artifacts.length) {
    throw new Error('此角色只有展柜配装。请先在角色库匹配本地圣遗物。');
  }
  if (project.candidate.actors.length >= teamSize) throw new Error('队伍已有四位角色，请先移除需要替换的队员。');
  if (project.candidate.actors.some(actor => actor.build?.character.id === build.character.id)) {
    throw new Error('队伍已经有这位角色。');
  }
  const artifacts = Object.entries(character.equipment).map(([slot, itemId]) => {
    const item = source.artifacts.find(entry => entry.id === itemId);
    if (!item?.real || item.slot !== slot) throw new Error('所装备的圣遗物有未补全的词条，请先补全。');
    if (item.mona?.setIdentityPending) throw new Error('所装备的圣遗物有待核对的套装，请先核对。');
    const current = account.artifacts.find(entry => entry.id === itemId);
    const owned = item.inventoryId !== null && !!current?.real && current.inventoryId !== null
      && !current.mona?.setIdentityPending && artifactValueSignature(current) === artifactValueSignature(item);
    if (owned && project.candidate.actors.some(actor => actor.build?.artifacts.some(piece => piece.inventory?.itemId === item.id && piece.inventory.accountId === account.id))) {
      throw new Error('队伍已占用这件实物，请先调整试配装备。');
    }
    return calculationArtifact(item.real, owned ? account.id : undefined);
  });
  const { getArtifactSet } = await import('@leyline/game-data');
  const sets = await Promise.all([...new Set(artifacts.map(item => item.setId))].filter(id => id !== 'none')
    .map(id => build.sets.find(set => set.id === id) ?? getArtifactSet(id)));
  return { name: character.name, build: buildSchema.parse({ ...build, artifacts, sets }) };
}

export function teamArtifactEntries(build?: Pick<Build, 'artifacts' | 'sets'>, account?: LocalAccount) {
  return accountSlots.map(slot => {
    const real = build?.artifacts.find(artifact => artifact.slot === slot);
    if (!real) return { slot };
    const original = real.inventory?.accountId === account?.id
      ? account?.artifacts.find(artifact => artifact.id === real.inventory?.itemId)
      : undefined;
    const set = build?.sets.find(entry => entry.id === real.setId);
    const item: AccountArtifact = {
      id: real.id, name: original?.name ?? `${set?.name ?? '圣遗物'} ${accountSlotLabels[slot]}`,
      slot, attack: 0, real,
    };
    return { slot, item };
  });
}
