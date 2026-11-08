# Repository Guidelines

## Project Structure & Module Organization

The TypeScript pnpm workspace lives under `src/`: `web` contains Vue components, Pinia stores, and the current Worker; `engine` owns simulation; `schema` owns validated contracts; `game-data` owns content snapshots. Each keeps implementation in its own `src/` directory.

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
- `pnpm test:ui`: focused U1 real-inventory UI smoke check in Chromium with one worker. Use this for daily U1 iteration; `pnpm test:ui:desktop` checks the runnable desktop package when needed.

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


## Current Product Priority and Acceptance Rules

User update on 2026-11-06: prioritize U1 UI and interaction work over exhaustive testing. During daily UI iteration, run only checks relevant to the changed operation; do not rerun all unit tests, all browsers, desktop, and both production paths after each edit. Avoid tests that merely mirror low-impact layout or text changes. Keep useful historical regressions available, but select them only when the affected behavior warrants it. Full stage acceptance and user experience review remain separate from these focused checks.

The user revised the plan after P3: execute U1 (dedicated UI and interaction redesign), then P5, P6, P4, P7, and P8. Read `docs/planning/implementation-roadmap.md` and the current implementation prompt; do not restore the old P4-first dependency order. P5/P6 must include necessary condition, inventory, capability, cancellation, and budget checks even though the full probability system is deferred.

From U1 onward, do not introduce or use simulated/synthetic examples to develop, demonstrate, benchmark, or accept new functionality. Use traceable actual game cases with real characters, equipment, mechanics, builds/inventory, and recorded conditions; derive expectations independently. Do not fabricate player exports, recordings, observations, inventories, or damage sequences. Missing evidence must remain an explicit gap. Follow `docs/planning/real-case-validation.md`.

Keep existing synthetic fixtures/tests as historical compatibility regressions; they do not prove acceptance of later stages. New boundary/error/performance cases must derive transparently from real projects. A static game catalog, a constructed format fixture, or an automated desktop export must not be presented as actual player data.

Preserve the approved theme and three data domains, but redesign the present interaction flow in U1. Functional automated checks and usability acceptance are separate; do not mark U1 complete or bypass it with P5/P6 product integration before actual task walkthroughs and user experience review. Provide the complete runnable redesign and evidence before requesting final experience review.

Run desktop and browser acceptance serially with one worker. Manage only processes proven to belong to the current run; never terminate applications by name or disturb the user's existing desktop.

## Current UI increment

The user explicitly authorized Enka UID public showcase input as a bounded U1 addition. Preserve preview/confirmation and keep showcase snapshots separate from physical inventory by default. The user explicitly authorized optional showcase-to-local import on 2026-11-08: only after that choice, reuse exact matches including set, slot, rarity, level, main stat/value and ordered substats; otherwise create a local item. This is user-confirmed content matching, not proof of game item identity. Never silently combine unrelated public and private accounts. Independent artifact combinations are saved only by explicit actions, never automatically from Mona import or role configurations. This does not advance the stage to P5/P6. Follow `docs/references/enka-import.md`.

New UI uses the semantic tokens and controls in `docs/design/visual-language.md` and `src/web/src/styles/palette.ts`. The current typography/control contract is 24/20/16/14px with a 14px minimum for ordinary text and hints, and 40/32/24px outer control heights. Only documented image/icon corner badges may use 12/10px via CornerBadge or data-ui-badge; primary card values and status labels are not badges. Reuse the shared metrics and components; resize or wrap layouts instead of shrinking text. Do not revive superseded size rules from planning history. The seven-element 21-color v1 palette remains pending user experience feedback; dark mode is not implemented. Keep checks focused on changed real-data paths, as requested by the user.

## Frontend review aids

When available, use `frontend-design`, `web-design-guidelines`, and `webapp-testing` for U1 visual/interaction reviews. The user-approved pages and `docs/design/visual-language.md` take precedence over generic skill defaults. Follow `docs/design/ui-review-workflow.md`; verify actual sequential typing (including constellation bonuses), label focus, keyboard navigation, modal boundaries, unsaved drafts, and narrow layouts, not only programmatic fill. Keep the existing pnpm/Playwright regressions as repository checks; optional skill tooling runs in an isolated ignored environment without adding project dependencies or synthetic acceptance data.

## Retired UI (user decision, 2026-11-07)

Only the current WorkspaceShell ships. Do not restore LegacyWorkspaceShell, Workbench, AnnotationWorkbench, DeveloperTools, their old routes, old synthetic sample launchers, P3Panel, RealGamePanel mode switches, or the old simulation Worker/chart UI from historical documentation. Current candidate editing lives in TeamLoadoutEditor. Engine/core compatibility fixtures and regressions remain; historical sample builders belong only in tests/helpers. Removing obsolete UI must not delete user account/project files or browser storage.
