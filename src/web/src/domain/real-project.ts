import { realBuildSchema, realElements, type RealBuild, type RealDamage, type RealEnemy, type WorkbenchProject } from '@leyline/schema';
import { nextRecordId } from './workbench-project';

export function defaultRealEnemy(): RealEnemy {
  return { level: 90, resistances: Object.fromEntries(realElements.map(element => [element, 0.1])) as RealEnemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
}

export function addRealActor(project: WorkbenchProject, input: RealBuild, name?: string): string {
  const build = realBuildSchema.parse(input);
  const id = crypto.randomUUID();
  const source = { kind: 'preset' as const, reference: build.dataVersion, verified: true };
  project.definitions.push(
    { id: `${id}-character`, name: `${build.character.name} · 角色快照`, version: build.dataVersion, source, nodes: [], effects: [] },
    { id: `${id}-weapon`, name: `${build.weapon.name} · 武器快照`, version: build.dataVersion, source, nodes: [], effects: [] },
    { id: `${id}-real-damage`, name: `${build.character.name} · 真实技能伤害`, version: build.dataVersion, source,
      nodes: [{ id: 'real-damage', op: 'game-damage' }], damage: 'real-damage', effects: [] },
  );
  project.candidate.actors.push({ id, name: name || build.character.name, character: `${id}-character`, weapon: `${id}-weapon`, inputs: {}, realBuild: build });
  project.enemy ??= defaultRealEnemy();
  return id;
}

export function addRealHits(project: WorkbenchProject, actorId: string, skillId: string, timeMs: number, crit: RealDamage['crit'] = 'noncritical'): string[] {
  const actor = project.candidate.actors.find(entry => entry.id === actorId);
  const skill = actor?.realBuild?.character.skills.find(entry => entry.id === skillId);
  if (!actor || !skill || !Number.isInteger(timeMs) || timeMs < 0 || timeMs > 3600000) throw new Error('请选择队员、技能和合法的整数毫秒时间。');
  if (!skill.support.supported || !skill.multipliers.length) throw new Error('该技能命中尚未核验，请选择首批支持的战技。');
  const ids: string[] = [];
  for (let hitIndex = 0; hitIndex < skill.multipliers.length; hitIndex++) {
    const id = nextRecordId(project);
    project.timeline.push({ id, timeMs, order: Math.max(-1, ...project.timeline.map(record => record.order)) + 1,
      actor: actor.id, kind: 'damage', definition: `${actor.id}-real-damage`, realDamage: { skillId, hitIndex, crit, reaction: 'none' } });
    if (project.objective.damageIds) project.objective.damageIds.push(id);
    ids.push(id);
  }
  return ids;
}
