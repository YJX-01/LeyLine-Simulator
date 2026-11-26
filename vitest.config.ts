import { availableParallelism } from 'node:os';
import { catalogPlugin } from './tools/scripts/build/catalog-plugin.mjs';
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({ plugins: [catalogPlugin()], resolve:{alias:{
 '@leyline/schema/version':resolve('src/schema/src/version.mjs'),
 '@leyline/schema/buffs':resolve('src/schema/src/calculation/buffs.mjs'),
 '@leyline/schema/hit-bindings':resolve('src/schema/src/calculation/hit-bindings.mjs'),
 '@leyline/schema/enka':resolve('src/schema/src/exchange/enka.ts'), '@leyline/schema':resolve('src/schema/src/index.ts'),
 '@leyline/game-data/character-file':resolve('src/game-data/src/character-file.mjs'), '@leyline/game-data':resolve('src/game-data/src/index.ts'),'@leyline/engine':resolve('src/engine/src/index.ts'),
 'vue':resolve('src/web/node_modules/vue'),'pinia':resolve('src/web/node_modules/pinia'),
}},test:{maxWorkers: Math.min(6, Math.max(3, availableParallelism() - 2)), testTimeout: 15000, include:['tests/unit/**/*.test.ts','tests/integration/**/*.test.ts']}});
