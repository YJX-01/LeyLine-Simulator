import { defineStore } from 'pinia';
import { ref } from 'vue';
import { workbenchProjectSchema, type WorkbenchProject } from '@leyline/schema';
import { downloadJson } from '../domain/download';

export interface SavedTeam { id: string; name: string; project: WorkbenchProject }
const key = 'leyline-saved-teams-v1';
export const useSavedTeamsStore = defineStore('saved-teams', () => {
  const teams = ref<SavedTeam[]>([]);
  const error = ref('');
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const input: unknown = JSON.parse(stored);
      if (!Array.isArray(input) || input.length > 100) throw new Error();
      teams.value = input.map(entry => {
        if (!entry || typeof entry.id !== 'string' || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 160) throw new Error();
        return { id: entry.id, name: entry.name, project: workbenchProjectSchema.parse(entry.project) };
      });
    }
  } catch { error.value = '保存的队伍无法读取，原始本地资料未覆盖。'; }
  function save(name: string, project: WorkbenchProject) {
    if (error.value) throw new Error(error.value);
    if (!name.trim() || name.length > 160) throw new Error('请输入不超过 160 字的队伍名称。');
    if (!project.candidate.actors.length) throw new Error('请先从账号选择队员。');
    if (teams.value.length >= 100) throw new Error('已达到 100 支队伍上限，请先导出备份并整理。');
    const snapshot = workbenchProjectSchema.parse(project);
    snapshot.timeline = [];
    snapshot.objective = {};
    const next = [...teams.value, { id: crypto.randomUUID(), name: name.trim(), project: snapshot }];
    localStorage.setItem(key, JSON.stringify(next));
    teams.value = next;
  }
  function exportTeams() { downloadJson(teams.value, 'leyline-teams.json'); }
  return { teams, error, save, exportTeams };
});
