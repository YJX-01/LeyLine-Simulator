import { buildSchema, type Build, type Project } from '@leyline/schema';
import { accountSlots, accountSlotLabels, type AccountArtifact, type LocalAccount } from './account';
import { calculationArtifact } from './build-snapshot';

export type TeamMember = Project['candidate']['actors'][number];
export const teamSize = 4;

export function teamMemberName(member: TeamMember): string {
  return member.name ?? member.build?.character.identity.name ?? '队员';
}

export function teamMemberPortrait(member: TeamMember): string | undefined {
  return member.build?.character.derivedFrom?.id ?? member.build?.character.id;
}

export async function prepareTeamMember(project: Project, account: LocalAccount, characterId: string) {
  const character = account.characters.find(entry => entry.id === characterId);
  const build = character?.build;
  if (!character || !build) throw new Error('请先在角色库补全该角色的培养与武器。');
  if (character.showcase && !Object.values(character.equipment).length && character.showcase.build.artifacts.length) {
    throw new Error('此角色只有展柜配装。请先在角色库匹配本地圣遗物。');
  }
  if (project.candidate.actors.length >= teamSize) throw new Error('队伍已有四位角色，请先移除需要替换的队员。');
  if (project.candidate.actors.some(actor => actor.build?.character.id === build.character.id)) {
    throw new Error('队伍已经有这位角色。');
  }
  const artifacts = Object.values(character.equipment).map(itemId => {
    const item = account.artifacts.find(entry => entry.id === itemId);
    if (!item?.real) throw new Error('所装备的圣遗物有未补全的词条，请先补全。');
    if (item.mona?.setIdentityPending) throw new Error('所装备的圣遗物有待核对的套装，请先核对。');
    if (project.candidate.actors.some(actor => actor.build?.artifacts.some(piece => piece.id === item.id && piece.inventory?.accountId === account.id))) {
      throw new Error('队伍已占用这件实物，请先调整试配装备。');
    }
    return calculationArtifact(item.real, account.id);
  });
  const { getArtifactSet } = await import('@leyline/game-data');
  const sets = await Promise.all([...new Set(artifacts.map(item => item.setId))].filter(id => id !== 'none').map(id => getArtifactSet(id)));
  return { name: character.name, build: buildSchema.parse({ ...build, artifacts, sets }) };
}

export function teamArtifactEntries(build?: Build, account?: LocalAccount) {
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
