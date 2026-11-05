# Repository Guidelines

## Project Structure & Module Organization

The active application is a pnpm workspace using Vue 3 and TypeScript. `apps/web/src/` contains Vue components, Pinia stores, charts, and the simulation Web Worker. Shared packages live under `packages/`: `engine` implements combat calculations, `schema` defines validated contracts, and `game-data` supplies game content and generated snapshots.

Unit tests sit beside source files; browser tests live in `tests/e2e/` and `tests/production/`. `fixtures/` holds reproducible scenarios and performance inputs. `docs/` contains mechanics references, architecture decisions, source data, and deployment guidance. `scripts/` handles conversion, benchmarks, and releases. The Python implementation in `src/` is retained as migration reference.

## Build, Test, and Development Commands

Use Node.js 22.12+ (24 LTS recommended) and pnpm 11.3.0. Run commands from the repository root.

- `pnpm install --frozen-lockfile`: install workspace dependencies.
- `pnpm dev`: start the Vite development server.
- `pnpm typecheck`: check TypeScript and Vue types.
- `pnpm test`: run Vitest unit tests.
- `pnpm build`: create the production web build.
- `pnpm data:check` and `pnpm fixture:check`: verify generated data and scenario consistency.
- `pnpm exec playwright install chromium firefox webkit`: install browser test engines.
- `pnpm test:e2e`: run development browser tests; add `--project=chromium` for a focused run.
- `pnpm build:check` and `pnpm perf:engine`: verify bundle and engine performance budgets.

For production and subpath validation, follow `docs/deployment.md`.

## Coding Style & Naming Conventions

Follow surrounding code: two-space indentation, single-quoted TypeScript strings, semicolons, and ES module imports. Keep strict TypeScript checks passing. Use PascalCase for Vue components, camelCase for functions and variables, and descriptive kebab-case module filenames where established. No dedicated lint or formatter script is configured.

## Testing Guidelines

Name colocated Vitest tests `*.test.ts` and Playwright tests `*.spec.ts`. Add regression coverage for changed mechanics or workflows, using deterministic scenarios and documented expected calculations. No numeric coverage threshold is configured. Before submitting, run data checks, type checks, unit tests, and the build; run relevant browser tests for UI changes. CI also checks all three browser engines, production deployment, and performance budgets.

## Commit & Pull Request Guidelines

Recent commits use prefixes such as `feat:`, `fix:`, `test:`, `perf:`, and `docs:` followed by a concise imperative description. Follow that convention. PR descriptions should explain changed behavior, link relevant issues, report validation commands and results, and include screenshots for visible UI changes. Document mechanics assumptions or supported-content changes in `docs/mechanics/` and the support matrix.