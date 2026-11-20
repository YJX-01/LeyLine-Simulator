# Repository Guidelines

## Current scope

The foundation review and U1 are closed. Keep implemented architecture, validated contracts, source evidence, the approved theme, and the three data domains. Current requirements live in [product direction](docs/product-direction.md). The [support and evidence records](tools/data/README.md#计算支持与验证资料) describe the supported cases and remaining gaps. Git retains review history. The pre-reset snapshot is `37ab994`, and the retired tracked tree is available at `48936d8:archive`.

Git commits and pushes require explicit user approval. Use descriptive conventional commit prefixes after approval. PRs explain behavior, validation, linked issues, and screenshots for UI changes. Keep dependency declarations in their owning manifests and include relevant lockfile and patch changes together.

## Structure and code

- `src/schema` owns shared contracts. `src/game-data` owns canonical JSON and on-demand catalog loading. `src/engine` owns attribute, damage, dependency, and timeline evaluation. `src/web` owns UI, state, Worker, desktop, and server adapters.
- Use workspace public exports through `@leyline/*`. Web uses the other three workspaces. Engine and game-data depend only on schema. Keep platform and UI dependencies out of shared packages and reactive state out of web domain modules.
- Use strict TypeScript, two-space indentation, single-quoted strings, semicolons, PascalCase Vue components, camelCase functions, and kebab-case filenames. Preserve deterministic event ordering, seeded randomness, and per-run state.
- Put tests and helpers under `tests`, grouped into package units, integration, development and production browsers, desktop, and performance. Use `tools/scripts` for tool entry points and `tools/lib` for shared helpers. Keep dependencies and generated files out of source changes. Retired implementations and data stay outside active tools, builds, and checks.

## Content and documentation

Use one compact `CharacterMetadata` JSON contract for built-in and custom definitions, covering identity, text, growth, parameters, hits, effects, and support. Maintain corresponding weapon, set, and table schemas. Keep IDs, units, precision, and meaningful array order. Use two-space UTF-8 JSON without BOM, LF, and one final newline. Use the shared strict JSON helpers for JavaScript and Python. Metadata sources use JSON exclusively.

Vite reads canonical inputs from `src/game-data/data`. Ordinary generation runs offline and prepares resources without overwriting authored definitions. Capture sources and create review candidates explicitly before adopting them. Put evidence in `tools/data/sources`, all maintained images and vectors in `assets`, and unmanaged upstream trees and caches in ignored `.references`. Maintain asset paths, aliases, and identity in `assets/manifest.json`, acquisition inputs in `tools/data/sources/asset-capture`, and rights in `assets/README.md`. Generate cache revisions and release fingerprints as needed. Maintain permanent hashes only for functional recording, placeholder, or dependency checks.

Use the root version for first-party schema tags and storage namespaces. Use current files and storage keys exclusively, reject unsupported versions, and preserve existing user files and browser storage during cleanup. Mona and Enka keep their external import previews.

Follow the [documentation standard](docs/documentation.md). Keep topic documents flat and free of operational details. Put implementation and command details in each module README. Schema, web, tools, and tools/data each maintain one README. Keep dates, sources, and cases with their owning data or module.

## Validation and delivery

Use Node.js 22.12+ and pnpm 11.3.0 from the root. CI uses Node.js 24. Install with `pnpm install --frozen-lockfile`. Build resources with `pnpm data:build` and check adopted values with `pnpm data:check`. Use `pnpm architecture:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm build:check` as relevant. Browser and Worker changes require browser checks. See the [test commands](tests/README.md) and [delivery workflow](tools/README.md#构建托管与本地交付操作).

Test changed behavior with independent expectations for mechanics. Use traceable actual game content and authorized records for development, demonstrations, benchmarks, and acceptance. Derive error and performance cases transparently from actual inputs. Current empty documents are suitable for software-only save and cancellation checks. Skip checks when their original recordings are unavailable. Never fabricate inventory, player exports, observations, or damage sequences, or introduce fixture directories or historical scenario helpers. Software checks and game observations are separate evidence. Follow the [evidence standard](docs/evidence-and-validation.md).

Use focused Chromium checks for daily UI iteration, including `pnpm test:ui` for the real inventory flow and `pnpm test:desktop` for the runnable desktop package when applicable. Perform desktop and browser acceptance serially with one worker. Manage only processes verified to belong to the current run. Asset checks cover all current character references and browser decoding.

Retain the two latest successful packages per desktop and web release family. Preview shares the desktop package. Clean temporary workspaces on success and failure, publish the completed package before pruning, and preserve running packages, private inputs, and review candidates. Reuse identical generated bytes. Use `pnpm clean:outputs`, `pnpm clean:cache`, and `pnpm outputs:prune` for their documented output scopes. Keep packaging checks focused on changed file operations.

## Approved UI

Only the current WorkspaceShell ships. TeamLoadoutEditor owns candidate editing. Keep the approved account and timeline interactions and the dedicated Project damage calculator. The calculator uses the shared evaluator and keeps its own loadouts and comparison baseline. Review other UI changes before implementing them. Keep character introductions, skill descriptions, and support diagnostics out of character detail and cultivation views. Keep metadata available for editing, calculation, and export.

Use the semantic palette and shared controls in the [interface standard](docs/interface.md). Text uses 24/20/16/14px, with 14px minimum for ordinary text and hints. Controls are 40/32/24px high. Documented image or icon corner badges alone may use 12/10px. Wrap or resize layouts. Use existing saved and dirty state for feedback and preserve validation and conflict confirmation in place. The seven-element palette awaits user feedback. Dark mode remains pending.

When reviewing U1 interaction and visuals, use the available frontend-design, web-design-guidelines, and webapp-testing skills with repo conventions taking precedence. Verify sequential typing, including constellation bonuses, label focus, keyboard navigation, modal boundaries, unsaved drafts, and narrow layouts. Run optional skill tools in an ignored environment.

Role, draft, and showcase effective-roll calculations use their explicit build white stats. Independent creation starts with HP 14000, ATK 750, and DEF 700. Reference selection uses the matching local build when available. Saved combinations retain captured bases and each comparison side uses its supplied basis. Preserve denominators, snapshots, identity, deduplication, names, and sort rules. Applying a combination keeps its saved basis.

## External inventory

Follow the [external import protocol](src/web/README.md#外部导入协议). Enka UID preview defaults to import-and-merge, with snapshot-only available. Confirmation writes the selected data and keeps sources separate. Match existing physical items by set, slot, rarity, level, main stat and value, and ordered substats. Create a local item if no match exists. Verified showcase enhancement history takes precedence over local inference while preserving item IDs. This comparison matches content. It establishes no game item identity.

Shared inventory references can belong to multiple characters and saved configurations or combinations. Equipping keeps other references and needs no transfer. Confirmed merge replaces the selected characters' slot references and clears missing slots, while retaining old inventory, other characters, and saved configurations and combinations. Snapshot-only and single-slot import leave local equipment intact. Keep unrelated public and private accounts separate. Save independent combinations only by explicit action. Deleting inventory detaches existing wearing and saved configuration and combination snapshots from the physical identity and marks them unowned. Recreating a physical item requires an explicit user action.
