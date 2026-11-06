import type { WorkbenchProject } from '../../src/schema/src/index';
import { createDefinition } from '../../src/web/src/domain/definition-library';

export function createSyntheticTeam(project: WorkbenchProject, name: string, attack: number): string {
  if (!Number.isFinite(attack)) throw new Error('攻击力必须为有限数值。');
  const character = createDefinition(`${name || '虚构角色'}定义`, 'character');
  const weapon = createDefinition('自定义武器', 'equipment');
  const damage = createDefinition('自定义伤害');
  project.definitions.push(character, weapon, damage);
  const id = crypto.randomUUID();
  project.candidate.actors.push({ id, name: name.trim() || '虚构角色', character: character.id, weapon: weapon.id, inputs: { attack: { value: attack, unit: 'attack' } } });
  return id;
}
