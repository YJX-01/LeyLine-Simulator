import { workbenchProjectSchema, type WorkbenchProject } from '@leyline/schema';
import { evaluateWorkbench } from '@leyline/engine';

export function createEmptyWorkbenchProject(id:string=crypto.randomUUID()):WorkbenchProject {
  return workbenchProjectSchema.parse({schemaVersion:1,rulesVersion:'workbench-v1',id,revision:'1',definitions:[],candidate:{id:`${id}-candidate`,actors:[]},conditions:{},timeline:[],objective:{}});
}

export function importWorkbenchProject(content: string): WorkbenchProject {
  let input: unknown;
  try { input = JSON.parse(content); } catch { throw new Error('文件不是有效的 JSON，当前项目保持不变。'); }
  const parsed = workbenchProjectSchema.safeParse(input);
  if (!parsed.success) throw new Error(`项目格式无效：${parsed.error.issues.slice(0, 3).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('；')}。当前项目保持不变。`);
  const result = evaluateWorkbench(parsed.data);
  if (result.status === 'invalid') throw new Error(`项目引用或计算规则无效：${result.diagnostics.slice(0, 3).map(d => `${d.path}: ${d.message}`).join('；')}。当前项目保持不变。`);
  return parsed.data;
}

export function setDamageSelected(project: WorkbenchProject, id: string, selected: boolean): void {
  const ids = project.objective.damageIds ?? project.timeline.filter(record => record.kind === 'damage').map(record => record.id);
  const next = new Set(ids);
  if (selected) next.add(id); else next.delete(id);
  project.objective.damageIds = [...next];
}

export function removeTimelineRecord(project: WorkbenchProject, id: string): void {
  project.timeline = project.timeline.filter(record => record.id !== id);
  if (project.objective.damageIds) project.objective.damageIds = project.objective.damageIds.filter(selected => selected !== id);
}

export function removeProjectActor(project: WorkbenchProject, id: string): void {
  const removed = new Set(project.timeline.filter(record => record.actor === id).map(record => record.id));
  project.timeline = project.timeline.filter(record => !removed.has(record.id));
  project.candidate.actors = project.candidate.actors.filter(actor => actor.id !== id);
  if (project.objective.damageIds) project.objective.damageIds = project.objective.damageIds.filter(record => !removed.has(record));
}

export function nextRecordId(project: WorkbenchProject): string {
  let index = project.timeline.length + 1;
  while (project.timeline.some(record => record.id === `record-${index}`)) index++;
  return `record-${index}`;
}
