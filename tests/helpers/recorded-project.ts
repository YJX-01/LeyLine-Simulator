import { readFileSync } from 'node:fs';
import type { Project } from '@leyline/schema';
import { createAccount } from '../../src/web/src/domain/account';
import { previewEnkaImport } from '../../src/web/src/domain/enka-import';
import { addActorFromBuild } from '../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../src/web/src/domain/workbench-project';

// A format-test derivative of the original showcase. It contains no observed combat.
export async function recordedProject(path = '.references/enka/official-example.json'): Promise<Project> {
  const response = JSON.parse(readFileSync(path, 'utf8'));
  const preview = await previewEnkaImport(response, '618285856', createAccount());
  const build = preview.rows.find(row => row.character.showcase!.build.character.id === 'xingqiu')!.character.showcase!.build;
  const project = createEmptyProject();
  addActorFromBuild(project, build);
  delete project.enemy; // The showcase does not record an enemy or combat conditions.
  return project;
}
