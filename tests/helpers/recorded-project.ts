import { officialShowcase, readRecordedReference } from './recorded-reference';
import type { Build, Project } from '@leyline/schema';
import { createAccount } from '../../src/web/src/domain/account';
import { previewEnkaImport } from '../../src/web/src/domain/enka-import';
import { addActorFromBuild } from '../../src/web/src/domain/real-project';
import { createEmptyProject } from '../../src/web/src/domain/workbench-project';

const showcaseBuilds = new Map<string, Promise<Map<string, Build>>>();

async function loadShowcaseBuilds(path: string) {
  const response = JSON.parse(readRecordedReference(path));
  const preview = await previewEnkaImport(response, String(response.uid), createAccount());
  const builds = new Map<string, Build>();
  for (const { character } of preview.rows) {
    const build = character.showcase?.build;
    if (build) builds.set(build.character.id, build);
  }
  return builds;
}

export async function recordedShowcaseBuild(characterId: string, path = officialShowcase): Promise<Build> {
  let pending = showcaseBuilds.get(path);
  if (!pending) {
    pending = loadShowcaseBuilds(path);
    showcaseBuilds.set(path, pending);
  }
  const build = (await pending).get(characterId);
  if (!build) throw new Error(`Missing recorded build for ${characterId} in ${path}`);
  return structuredClone(build);
}

// A format-test derivative of the original showcase. It contains no observed combat.
export async function recordedProject(path = officialShowcase): Promise<Project> {
  const build = await recordedShowcaseBuild('xingqiu', path);
  const project = createEmptyProject();
  addActorFromBuild(project, build);
  delete project.enemy; // The showcase does not record an enemy or combat conditions.
  return project;
}
