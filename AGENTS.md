# Repository Guidelines

## Approved refactor (2026-11-10)

The user reviewed and approved `docs/planning/repository-refactor.md`; its item-by-item review is complete. Status, migration maps and verification boundaries live in `docs/planning/repository-refactor-implementation.md`. U1 was explicitly confirmed ended; do not reopen its acceptance or restart the completed foundation refactor.

## Current work boundary

The user requested a repository/design reset. Keep implemented code, validated contracts, source evidence and essential product requirements. Obsolete stage plans, batch ledgers and handoff narratives are not current instructions; recover historical detail from Git rather than copying it back into maintained documents. The pre-reset snapshot is commit `37ab994`. No replacement implementation plan is approved. See `docs/planning/product-direction.md` for retained requirements and `docs/architecture/content-support.md` for actual capabilities.

## Project Structure & Module Organization

Four workspaces under src: schema owns shared validated contracts; game-data owns canonical JSON and generated runtime chunks; engine owns attribute/damage and dependency/timeline evaluation; web owns UI, state, Worker, desktop and server adapters. Each implementation lives in its own src; web/desktop and web/server contain platform application code.

All tests and helpers belong in tests, grouped by unit package, integration, browser/development, browser/production, desktop and performance. Assets have one canonical root assets. tools/scripts groups data, assets, checks, build, release, dev and licenses; shared helpers live in tools/lib. docs contains Markdown only; current standards are indexed by docs/standards/README.md. History in archive is excluded from every default command.

## Build, Test, and Development Commands

Use Node.js 22.12+ and pnpm 11.3.0; CI uses Node.js 24. Run from the repository root.

- `pnpm install --frozen-lockfile`: install declared dependencies and patches.
- `pnpm dev`: start Vite; `pnpm build`: build production output.
- `pnpm architecture:check`: enforce workspace boundaries, runtime cycle checks, and archive isolation.
- `pnpm data:check`: verify canonical content and generated inputs.
- `pnpm typecheck` / `pnpm test`: check types and run unit tests.
- `pnpm build:check` / `pnpm perf:engine`: check size and performance budgets.
- `pnpm test:e2e`: run browser tests after installing Playwright browsers.
- `pnpm test:ui`: focused U1 real-inventory UI smoke check in Chromium with one worker. Use this for daily U1 iteration; `pnpm test:ui:desktop` checks the runnable desktop package when needed.

Production/subpath checks and release prerequisites are documented in `docs/guides/deployment.md`.

## Coding Style & Architecture

Use two-space indentation, single-quoted TypeScript strings, semicolons, and strict typing. Use PascalCase Vue components, camelCase functions, and kebab-case filenames. No formatter or lint script is configured.

Import workspace public exports through `@leyline/*`. Only web depends on engine; engine depends only on schema, and game-data reuses schema through its declared dependency. Keep shared packages independent of UI/platform adapters, and web domain modules independent of reactive stores and components. Preserve deterministic event ordering, seeded randomness, and per-run state.

## Testing & Data Changes

Add regression tests for changed behavior, with independent expected calculations for mechanics. No numeric coverage threshold is configured. Run relevant data checks, architecture checks, types, tests, and build validation; UI/Worker changes also require browser tests.

Production metadata is strict two-space UTF-8/LF JSON under src/game-data/data. Each character has one complete CharacterDefinition (identity/text, growth, talent parameters and hit bindings, passives, constellations, static rules and honest capabilities), shared by builtin/custom definitions, UI, engine and export. Weapon/set entities and current tables share corresponding schemas. Edit canonical data, run pnpm data:build, and review numeric comparisons with pnpm data:check. Upstream evidence belongs in tools/data/sources, images in assets, derived files in package generated directories. Never read archived tables in active tools. See docs/standards/content.md and docs/references/numeric-precision.md.

User update on 2026-11-10: this is a breaking refactor. Support only current document schemas and storage namespaces; remove old document migration, preview/conversion adapters and fallback reads. Reject unsupported file versions. Do not delete existing user files or browser storage as part of code cleanup. Mona/Enka external import previews remain part of the current product.

User update on 2026-11-10 supersedes the YAML choice: JSON first, one common character metadata contract. Use two-space indentation, UTF-8 without BOM, LF and one final newline. Preserve precision, units, IDs and meaningful array order; provenance/support explanations use defined fields, longer explanations belong in docs. No YAML/JSONC/JSON5 metadata sources or YAML parser dependency. The shared content-source.mjs and Python content_source.py helpers handle strict JSON.

Generated snapshots belong in src/game-data/generated and web indices in src/web/generated. All maintained assets belong in assets. Adopted source evidence belongs in tools/data/sources. Archive is excluded from active builds and checks; no active script may read archived tables.

Regenerate with pnpm data:build and review snapshots and direct numeric comparisons with pnpm data:check. Capture sources and prepare candidates explicitly; review before adopting canonical JSON. Ordinary generation stays offline and never overwrites authored metadata. Update content support and assumptions when content changes.

## Commits & Repository Hygiene

Use descriptive `feat:`, `fix:`, `refactor:`, `test:`, `perf:`, `docs:`, or `chore:` commits. PRs explain behavior, validation, linked issues, and screenshots for UI changes.

Keep dependencies declared in their owning manifests; commit lockfile and patch changes together. Do not edit `node_modules/` manually or restore retired root directories. Use `pnpm clean:outputs` and `pnpm clean:cache` for generated files; preserve wanted release candidates and temporary patch edits first. Never commit generated outputs or import archived Python code.


## Current Product Priority and Acceptance Rules

User update on 2026-11-06: prioritize U1 UI and interaction work over exhaustive testing. During daily UI iteration, run only checks relevant to the changed operation; do not rerun all unit tests, all browsers, desktop, and both production paths after each edit. Avoid tests that merely mirror low-impact layout or text changes. Keep current behavior regressions and select checks relevant to the changed operation. Full stage acceptance and user experience review remain separate from these focused checks.

From U1 onward, do not introduce or use simulated/synthetic examples to develop, demonstrate, benchmark, or accept new functionality. Use traceable actual game cases with real characters, equipment, mechanics, builds/inventory, and recorded conditions; derive expectations independently. Do not fabricate player exports, recordings, observations, inventories, or damage sequences. Missing evidence must remain an explicit gap. Follow `docs/standards/evidence.md`.

User update on 2026-11-10: delete historical constructed fixtures, scenario-only helpers and their dedicated tests, including archived copies. Do not create or retain tests/fixtures or replacement fixture directories. Tests may read authorized original recordings already in ignored .references, and must explicitly skip recording-dependent checks when those originals are unavailable; do not generate substitutes. Do not preserve legacy scenarios for compatibility. New boundary/error/performance cases must derive transparently from real projects. A static game catalog, a constructed format fixture, or an automated desktop export must not be presented as actual player data.

Preserve the approved theme, three data domains and delivered U1 interaction flow. U1 is closed by the user's explicit confirmation on 2026-11-10. Functional checks and actual game observations remain distinct; the stage closure does not expand supported mechanics or supply missing player evidence.

Run desktop and browser acceptance serially with one worker. Manage only processes proven to belong to the current run; never terminate applications by name or disturb the user's existing desktop.

## UI scope lock (2026-11-10)

User addition on 2026-11-14: explicitly authorized a dedicated sidebar calculator page for checking damage, with `.references/mona-community` as a reference. Keep its loadouts and comparison baseline independent from the account and original timeline, and use the shared evaluator. This bounded addition does not authorize other changes to the existing character pages or timeline inspector; other interface changes still require explicit review.

Preserve the user-approved UI from before the repository refactor. Data, schema and architecture work does not authorize adding interface sections, explanatory copy, notifications, badges or redesigned interactions. Implement the user's explicit UI requests; raise any other proposed UI changes for review before implementation. Do not add character introductions or skill descriptions to character detail/cultivation views. Keep metadata available for content editing, calculation and export.

Do not inject operation-success notices into page or dialog contents, and do not replace them with unsolicited popups. Existing saved/dirty states and changed content provide feedback. Preserve required validation and conflict confirmation in their established locations. Do not append calculation-support diagnostics or extra small explanatory text to the approved character panel.

Preserve the existing effective-roll basis policy while cleaning UI: role/draft and showcase calculations use their explicit build white stats; independent creation starts with defaults (HP 14000, ATK 750, DEF 700), and reference selection uses the matching local build when available. Saved combinations retain their captured basis; comparison sides retain their own supplied basis. Removing weapon labels or tooltips must not change numeric denominators, snapshot fields, combination identity/deduplication, naming or sorting rules. Do not automatically rebase combinations to the target character.

## Current UI increment

The user explicitly authorized Enka UID public showcase input as a bounded U1 addition. Preserve preview/confirmation and separate showcase snapshots from local physical inventory and wearing. Showcase-to-local import was authorized on 2026-11-08; on 2026-11-09 the user explicitly changed the preview default to import-and-merge, while retaining snapshot-only as a choice. Nothing is written before confirmation. Reuse exact matches including set, slot, rarity, level, main stat/value and ordered substats; otherwise create a local item. Merge verified showcase enhancement history ahead of local inference without changing item IDs. On 2026-11-10 the user confirmed shared artifact references: multiple local characters, saved configurations and combinations may reference one inventory item; equipping never removes another character’s reference or requires transfer confirmation. Confirmed showcase import-and-merge replaces only the selected characters’ local slot references with the resolved showcase items (missing slots clear); old inventory, other characters and saved configurations/combinations remain. Snapshot-only and single-slot inventory import do not change local equipment. This is user-confirmed content matching, not proof of game item identity. Never silently combine unrelated public and private accounts. Independent artifact combinations are saved only by explicit actions, never automatically from Mona import or role configurations. Deleting inventory preserves existing wearing and saved combination/configuration content as detached snapshots with no inventory identity and an explicit unowned badge; never silently recreate those physical items. Follow `docs/references/enka-import.md`.

New UI uses the semantic tokens and controls in `docs/design/visual-language.md` and `src/web/src/styles/palette.ts`. The current typography/control contract is 24/20/16/14px with a 14px minimum for ordinary text and hints, and 40/32/24px outer control heights. Only documented image/icon corner badges may use 12/10px via CornerBadge or data-ui-badge; primary card values and status labels are not badges. Reuse the shared metrics and components; resize or wrap layouts instead of shrinking text. Do not revive superseded size rules from planning history. The seven-element 21-color v1 palette remains pending user experience feedback; dark mode is not implemented. Keep checks focused on changed real-data paths, as requested by the user.

## Frontend review aids

When available, use `frontend-design`, `web-design-guidelines`, and `webapp-testing` for U1 visual/interaction reviews. The user-approved pages and `docs/design/visual-language.md` take precedence over generic skill defaults. Follow `docs/design/ui-review-workflow.md`; verify actual sequential typing (including constellation bonuses), label focus, keyboard navigation, modal boundaries, unsaved drafts, and narrow layouts, not only programmatic fill. Keep the existing pnpm/Playwright regressions as repository checks; optional skill tooling runs in an isolated ignored environment without adding project dependencies or synthetic acceptance data.

## Retired UI (user decision, 2026-11-07)

Only the current WorkspaceShell ships. Do not restore LegacyWorkspaceShell, Workbench, AnnotationWorkbench, DeveloperTools, their old routes, old synthetic sample launchers, P3Panel, RealGamePanel mode switches, or the old simulation Worker/chart UI from historical documentation. Current candidate editing lives in TeamLoadoutEditor. Historical constructed scenarios and their dedicated tests/helpers have been removed by user decision. Current functional checks use actual recordings or explicit format/error derivatives. Removing obsolete UI must not delete user account/project files or browser storage.

User review update (2026-11-10): maintained asset/game-data records use IDs, paths, aliases and source versions; do not add bulk permanent SHA-256 inventories. Compute cache revisions and build/release fingerprints in generated artifacts. Preserve only functional recording/placeholder or dependency checks. Asset checks must cover every actual current character reference and browser decoding, not only already-listed files.

User build-output update (2026-11-10): keep only the latest and previous successful package per desktop/web release family. Preview shares the desktop output; remove temporary build workspaces on success or failure, and never prune previous packages before the new package is complete. Generated/cache files reuse unchanged bytes. clean:outputs covers generated intermediates but preserves the final pair, private inputs and review candidates. Use outputs:prune for older recognized packages; do not terminate applications to delete a running package. Keep verification focused on changed packaging/file operations, not the full UI matrix.
