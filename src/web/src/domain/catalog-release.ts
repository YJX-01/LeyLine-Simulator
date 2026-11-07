import metadata from './data/catalog-release-metadata.json';

export type ReleaseMetadata = { name: string; version: string; gameId: number; rarity?: number };
export function releaseMetadata(group: 'characters' | 'weapons' | 'artifacts', id?: string, name?: string): ReleaseMetadata | undefined {
  const entries = metadata[group] as Record<string, ReleaseMetadata>;
  return (id ? entries[id] : undefined) ?? (name ? Object.values(entries).find(entry => entry.name === name) : undefined);
}
export function compareReleaseNewest(a?: ReleaseMetadata, b?: ReleaseMetadata): number {
  if (!a || !b) return a ? -1 : b ? 1 : 0;
  const left = a.version.split('.').map(Number), right = b.version.split('.').map(Number);
  return right[0] - left[0] || right[1] - left[1] || b.gameId - a.gameId;
}
