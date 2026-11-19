import { storageKeyFor } from '@leyline/schema/version';
import { packDocument, unpackDocument } from '../domain/content-document';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { idSchema, projectSchema, type Project } from '@leyline/schema';
import { teamSize, type TeamSlot } from '../domain/team-members';

export interface SavedTeam { id: string; name: string; project: Project; favorite?: number; slots?: (TeamSlot | null)[] }
export const teamNameLimit = 160;
const key = storageKeyFor('saved-teams');

function readSlots(input: unknown, project: Project): (TeamSlot | null)[] | undefined {
  if (input === undefined) return undefined;
  if (!Array.isArray(input) || input.length < teamSize || input.length > 100) throw new Error('队员槽格式无效。');
  const slots = input.map(slot => {
    if (slot === null) return null;
    const actorId = idSchema.parse(slot?.actorId);
    if (slot.configuration === undefined) return { actorId };
    const configuration = {
      accountId: idSchema.parse(slot.configuration?.accountId),
      characterId: idSchema.parse(slot.configuration?.characterId),
      presetId: slot.configuration?.presetId === '' ? '' : idSchema.parse(slot.configuration?.presetId),
    };
    return { actorId, configuration };
  });
  const placed = slots.filter(slot => slot !== null);
  const actors = project.candidate.actors;
  if (placed.length !== actors.length || new Set(placed.map(slot => slot.actorId)).size !== placed.length
    || placed.some((slot, index) => slot.actorId !== actors[index].id)) throw new Error('队员槽和队伍快照不一致。');
  return slots;
}

export const useSavedTeamsStore = defineStore('saved-teams', () => {
  const teams = ref<SavedTeam[]>([]);
  const error = ref('');
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
    if (stored) {
      const input: unknown = unpackDocument('saved-teams', JSON.parse(stored));
      if (!Array.isArray(input) || input.length > 100) throw new Error();
      const next: SavedTeam[] = input.map(entry => {
        if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > teamNameLimit) throw new Error();
        const { favorite } = entry;
        if (favorite !== undefined && (!Number.isInteger(favorite) || favorite < 0 || favorite > 3)) throw new Error();
        const project = projectSchema.parse(entry.project);
        const slots = readSlots(entry.slots, project);
        return { id: entry.id, name: entry.name, project, ...(favorite === undefined ? {} : { favorite }), ...(slots ? { slots } : {}) };
      });
      teams.value = next;
    }
  } catch { error.value = '保存的队伍无法读取，原始本地资料未覆盖。'; }
  function persist(next: SavedTeam[]) {
    if (error.value) throw new Error(error.value);
    const content = JSON.stringify(packDocument('saved-teams', next));
    if (localStorage.getItem(key) !== stored) throw new Error('队伍库已在其他窗口更新，请重新打开应用。');
    localStorage.setItem(key, content);
    stored = content;
    teams.value = next;
  }
  function teamIndex(team: SavedTeam) {
    const index = teams.value.indexOf(team);
    if (index === -1) throw new Error('队伍已更新，请重新打开详情。');
    return index;
  }
  function writeTeam(team: SavedTeam, original?: SavedTeam): SavedTeam {
    if (!original && teams.value.length >= 100) throw new Error('已达到 100 支队伍上限，请先整理已保存的队伍。');
    const index = original ? teamIndex(original) : teams.value.length;
    const next = [...teams.value];
    next[index] = team;
    persist(next);
    return teams.value[index];
  }
  function save(name: string, project: Project, original?: SavedTeam, roster?: readonly (TeamSlot | null)[]): SavedTeam {
    if (!name.trim() || name.length > teamNameLimit) throw new Error(`请输入不超过 ${teamNameLimit} 字的队伍名称。`);
    if (!project.candidate.actors.length) throw new Error('请先从账号选择队员。');
    const snapshot = projectSchema.parse(project);
    snapshot.timeline = [];
    snapshot.objective = {};
    const slots = readSlots(roster ?? original?.slots, snapshot);
    return writeTeam({ ...original, id: original?.id ?? crypto.randomUUID(), name: name.trim(), project: snapshot, ...(slots ? { slots } : {}) }, original);
  }
  function setFavorite(team: SavedTeam, favorite: number): SavedTeam {
    if (!Number.isInteger(favorite) || favorite < 0 || favorite > 3) throw new Error('收藏等级无效。');
    return writeTeam({ ...team, favorite }, team);
  }
  function remove(team: SavedTeam) {
    const index = teamIndex(team);
    persist(teams.value.filter((_, current) => current !== index));
  }
  return { teams, error, save, setFavorite, remove };
});
