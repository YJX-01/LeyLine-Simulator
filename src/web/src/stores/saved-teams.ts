import { storageKeyFor } from '@leyline/schema/version';
import { packDocument, unpackDocument } from '../domain/content-document';
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { projectSchema, type Project } from '@leyline/schema';
import { downloadJson } from '../domain/download';

export interface SavedTeam { id: string; name: string; project: Project }
const key = storageKeyFor('saved-teams');
export const useSavedTeamsStore = defineStore('saved-teams', () => {
  const teams = ref<SavedTeam[]>([]);
  const error = ref('');
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(key);
    if (stored) {
      const input: unknown = unpackDocument('saved-teams', JSON.parse(stored));
      if (!Array.isArray(input) || input.length > 100) throw new Error();
      const next:SavedTeam[]=input.map(entry=>{
        if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 160) throw new Error();
        return {id:entry.id,name:entry.name,project:projectSchema.parse(entry.project)};
      });
      teams.value = next;
    }
  } catch { error.value = '保存的队伍无法读取，原始本地资料未覆盖。'; }
  function save(name: string, project: Project, original?: SavedTeam): SavedTeam {
    if (error.value) throw new Error(error.value);
    if (!name.trim() || name.length > 160) throw new Error('请输入不超过 160 字的队伍名称。');
    if (!project.candidate.actors.length) throw new Error('请先从账号选择队员。');
    if (!original && teams.value.length >= 100) throw new Error('已达到 100 支队伍上限，请先导出备份并整理。');
    const index = original ? teams.value.indexOf(original) : teams.value.length;
    if (index === -1) throw new Error('队伍已更新，请返回详情后重新编辑。');
    const snapshot = projectSchema.parse(project);
    snapshot.timeline = [];
    snapshot.objective = {};
    const team = { id: original?.id ?? crypto.randomUUID(), name: name.trim(), project: snapshot };
    const next = [...teams.value];
    next[index] = team;
    const content = JSON.stringify(packDocument('saved-teams', next));
    if (localStorage.getItem(key) !== stored) throw new Error('队伍库已在其他窗口更新，请重新打开应用后再保存。');
    localStorage.setItem(key, content);
    stored = content;
    teams.value = next;
    return team;
  }
  function exportTeams() { downloadJson(packDocument('saved-teams', teams.value), 'leyline-teams.json'); }
  return { teams, error, save, exportTeams };
});
