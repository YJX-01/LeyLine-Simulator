# Architecture and extension guidelines

> The default product is the shared desktop/web timeline workbench, implemented through P2.5 at `3315a09`. The preserved automatic simulator is a separate entry. See the [documentation index](../README.md), [stage roadmap](../planning/implementation-roadmap.md), and [P3 handoff](../planning/implementation-agent-prompt.md). Simulation-specific extension guidance below does not define new workbench behavior.

## Scope and ownership

The maintained product is the Vue 3 + TypeScript workspace under `src/`. Python source and its documentation live in `archive/python/` and have no runtime or build role. Root `README.md` describes setup and dependencies; `AGENTS.md` defines contributor and agent instructions for the current layout.

All four source workspaces are discovered by `src/*` in `pnpm-workspace.yaml`. Development scripts and dependency patches live together under `tools/`. Generated dependency data belongs in `node_modules/` and `.cache/`, never in extra root source or patch directories. The architecture check rejects retired root directories so subsequent changes cannot silently restore the old layout.

pnpm's isolated linker also generates workspace-local `node_modules/` links for declared dependencies. These are managed installation outputs, not additional copies of source. Do not merge or move them manually. `storeDir` is fixed to `.cache/pnpm-store` so installs do not create a separate root cache.

| Location | Responsibility | Allowed workspace dependencies |
| --- | --- | --- |
| `src/schema` | Input validation, versioned data and Worker contracts | None |
| `src/game-data` | Fixed snapshots and content definitions | None |
| `src/engine` | Calculation, scheduling, mechanics, content runtime | `schema`, `game-data` |
| `src/web` | Forms, plans, persistence, charts, Worker lifecycle | `schema`, `game-data`, `engine` |

Cross-workspace imports use declared package exports. Relative imports into sibling packages and imports of private package files are forbidden. Shared packages do not import Vue, Pinia, browser adapters, or Node built-ins. Type-only imports count for boundary checks; cycle detection checks runtime imports only.

## Application flow

The default `WorkspaceShell.vue` and formula tool share `stores/axis-workspace.ts`. Pure edit operations live in web domain modules; `axis.worker.ts` calls `@leyline/engine.evaluateWorkbench` with session/revision/task isolation. The public contracts live in `schema/src/workbench/index.ts`; P2.5 real builds use `schema/src/real-game.ts` and `engine/src/real-game.ts`. Account, project and definition files remain independent. Proposed P3 APIs in planning documents are not existing exports.

The preserved automatic simulator follows a separate flow: Vue components edit Pinia state. `composables/useTeamSimulation.ts` validates submitted configurations and manages `domain/team-task.ts`, which communicates with `attack.worker.ts`. The Worker calls engine entrypoints and returns versioned results. Charts and comparisons consume results without reconstructing combat rules. The editor also calls `resolveLoadout` synchronously for previews; full simulations run in the Worker.

`domain/` owns nonvisual transformations and persistence validation; `stores/` owns reactive state; `composables/` coordinates lifecycle; `components/` owns reusable UI; `charts/` owns chart loading. Domain modules must not depend on Vue, Pinia, components, stores, or composables. Storage and Worker access use the existing `StoragePort` and `WorkerPort` interfaces.

## Preserved simulator extension map

- Contracts: `schema/src/team.ts`, `combat.ts`, and `legacy.ts`. The latter still defines supported formula/developer-tool and Worker contracts; it is not dead Python code.
- Attributes and equipment: `engine/src/loadout.ts`, `gear-runtime.ts`, and their tests.
- Team command compilation: `team.ts`; timing and scaling: `team-profile.ts`.
- Character runtime and effects: `team-runtime.ts` and `team-effects.ts`; generic mechanics: `mechanics/`; orchestration: `combat.ts` and `combat-runtime.ts`.
- Extract new character behavior behind existing runtime hooks when needed, using instance-local state. Avoid parallel simulation paths or new packages without concrete consumers.

For each new mechanic, document assumptions and unsupported cases, add independently calculated expectations, and update the content support matrix. Preserve event order, seeded randomness, cancellation, and bounded logging.

## Source data and generated output

`docs/constant/*.json` remains the canonical generator input; `docs/characters/*.json` is supporting evidence. Run `node tools/scripts/convert-repo-data.mjs` after intentional source changes and review generated content and hashes in `src/game-data/src/generated/`. Never edit generated snapshots independently. P2.5 canonical inputs in `docs/constant/real-game/` use `tools/scripts/convert-real-game-data.mjs` to produce `src/game-data/src/real-data/`, including hashes; ordinary generation does not read `.references`. `pnpm data:check` covers both generators; `pnpm fixture:check` validates generated scenarios.

## Enforcement and validation

Run `pnpm architecture:check` for package exports, declared dependencies, layer boundaries, runtime cycles, and archive isolation. It scans static imports/re-exports, literal dynamic imports, and literal Worker URLs; computed module paths require review. No exceptions baseline is maintained. CI runs the same check before type checks.

Use `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm build:check` for changes. UI/Worker changes also need browser tests; performance-sensitive changes need `pnpm perf:engine`. Production/subpath and release requirements remain in [deployment guidance](../deployment.md). Archive edits do not justify changing simulation behavior or historical acceptance records.
