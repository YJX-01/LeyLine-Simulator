import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({ resolve:{alias:{
 '@leyline/schema/enka':resolve('src/schema/src/exchange/enka.ts'), '@leyline/schema':resolve('src/schema/src/index.ts'),
 '@leyline/game-data':resolve('src/game-data/src/index.ts'),'@leyline/engine':resolve('src/engine/src/index.ts'),
 'vue':resolve('src/web/node_modules/vue'),'pinia':resolve('src/web/node_modules/pinia'),
}},test:{include:['tests/unit/**/*.test.ts','tests/integration/**/*.test.ts']}});
