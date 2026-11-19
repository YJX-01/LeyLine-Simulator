import { createContentLinker as createLinker } from '../../src/game-data/src/link-content.mjs';

export function createContentLinker(options) {
  const linker = createLinker(options);
  return { character: async input => linker.character(input), weapon: async input => linker.weapon(input), set: async input => linker.set(input) };
}
