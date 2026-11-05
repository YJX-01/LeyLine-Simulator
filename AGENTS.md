# Repository Guidelines

## Project Structure & Module Organization

The TypeScript pnpm workspace lives under `src/`: `web` contains Vue components, Pinia stores, charts, and the Worker; `engine` owns simulation; `schema` owns validated contracts; `game-data` owns content snapshots. Each keeps implementation in its own `src/` directory.

Colocated `*.test.ts` files use Vitest. Browser `*.spec.ts` files live in `tests/e2e/` and `tests/production/`. Scenarios belong in `fixtures/`, automation in `tools/scripts/`, dependency patches in `tools/patches/`, and references in `docs/`. `archive/python/` is historical material, excluded from the active build.

## Build, Test, and Development Commands

Use Node.js 22.12+ and pnpm 11.3.0; CI uses Node.js 24. Run from the repository root.

- `pnpm install --frozen-lockfile`: install declared dependencies and patches.
- `pnpm dev`: start Vite; `pnpm build`: build production output.
- `pnpm architecture:check`: enforce workspace boundaries, runtime cycle checks, and archive isolation.
- `pnpm data:check` / `pnpm fixture:check`: verify generated inputs.
- `pnpm typecheck` / `pnpm test`: check types and run unit tests.
- `pnpm build:check` / `pnpm perf:engine`: check size and performance budgets.
- `pnpm test:e2e`: run browser tests after installing Playwright browsers.

Production/subpath checks and release prerequisites are documented in `docs/deployment.md`.

## Coding Style & Architecture

Use two-space indentation, single-quoted TypeScript strings, semicolons, and strict typing. Use PascalCase Vue components, camelCase functions, and kebab-case filenames. No formatter or lint script is configured.

Import workspace public exports through `@leyline/*`. Only web depends on engine; engine may depend on schema and game-data. Keep shared packages independent of UI/platform adapters, and web domain modules independent of reactive stores and components. Preserve deterministic event ordering, seeded randomness, and per-run state.

## Testing & Data Changes

Add regression tests for changed behavior, with independent expected calculations for mechanics. No numeric coverage threshold is configured. Run relevant data checks, architecture checks, types, tests, and build validation; UI/Worker changes also require browser tests.

Edit canonical inputs in `docs/constant/`, regenerate with `node tools/scripts/convert-repo-data.mjs`, and review snapshots and hashes together. Update mechanics assumptions and the support matrix when content changes.

## Commits & Repository Hygiene

Use descriptive `feat:`, `fix:`, `refactor:`, `test:`, `perf:`, `docs:`, or `chore:` commits. PRs explain behavior, validation, linked issues, and screenshots for UI changes.

Keep dependencies declared in their owning manifests; commit lockfile and patch changes together. Do not edit `node_modules/` manually or restore retired root directories. Use `pnpm clean:outputs` and `pnpm clean:cache` for generated files; preserve wanted release candidates and temporary patch edits first. Never commit generated outputs or import archived Python code.
