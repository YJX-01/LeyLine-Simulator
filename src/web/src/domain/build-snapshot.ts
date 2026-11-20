import { APP_VERSION } from '@leyline/schema/version';
import { buildSchema, type ArtifactItem, type Build } from '@leyline/schema';

export function calculationArtifact(item: ArtifactItem | Build['artifacts'][number], accountId?: string): Build['artifacts'][number] {
  return { ...item, inventory: accountId ? { accountId, itemId: item.id } : 'inventory' in item ? item.inventory : null,
    sourceRefs: 'sourceRefs' in item ? [...item.sourceRefs] : [] };
}

export function physicalArtifact(item: Build['artifacts'][number]): ArtifactItem {
  const { inventory, sourceRefs, ...physical } = item;
  return physical;
}

type NewBuild = Omit<Build, 'schemaVersion' | 'kind' | 'sources' | 'artifactMainSourceRefs' | 'artifacts'> & { artifacts: readonly (ArtifactItem | Build['artifacts'][number])[] };
export function createBuildSnapshot(input: NewBuild, references: Pick<Build, 'sources' | 'artifactMainSourceRefs'>): Build {
  return buildSchema.parse(assembleBuildSnapshot(input, references));
}

export function assembleBuildSnapshot(input: NewBuild, { sources, artifactMainSourceRefs }: Pick<Build, 'sources' | 'artifactMainSourceRefs'>): Build {
  return { ...input, sources, artifactMainSourceRefs, schemaVersion: APP_VERSION, kind: 'calculation-build', artifacts: input.artifacts.map(item => calculationArtifact(item)) };
}
