# Repository Guidelines

## Project structure

Keep account, timeline project, and content library data separate. Follow the [product direction](docs/product-direction.md) and check [supported cases](tools/data/README.md#计算支持与验证资料) before extending mechanics.

- `src/schema` defines shared contracts. `src/game-data` owns canonical JSON and catalog loading. `src/engine` evaluates attributes, damage, and timelines. Both depend only on schema.
- `src/web` owns Vue UI, state, Worker, desktop, and server adapters. Import other workspaces through `@leyline/*`. Keep reactive state out of domain modules.
- Put maintained images and vectors in `assets`, evidence in `tools/data/sources`, and unmanaged upstream material in ignored `.references`. Keep tool entry points in `tools/scripts` and shared helpers in `tools/lib`.

## Local development

Use Node.js 22.12+ and pnpm 11.3.0 from the repository root. CI uses Node.js 24.

| Command | Purpose |
| --- | --- |
| `pnpm install --frozen-lockfile` | Install locked dependencies. |
| `pnpm dev` | Prepare resources and start the web app. |
| `pnpm data:build` / `pnpm data:check` | Generate resources offline / verify adopted data. |
| `pnpm architecture:check` / `pnpm typecheck` | Check module boundaries / TypeScript and Vue types. |
| `pnpm build` then `pnpm build:check` | Build and verify the production web bundle. |

## Code and data conventions

Use strict TypeScript, two spaces, single quotes, and semicolons. Use PascalCase for Vue components, camelCase for functions, and kebab-case for other filenames. Preserve deterministic event order, seeded randomness, and per-run state.

Use `CharacterMetadata` for built-in and custom characters. Preserve IDs, units, precision, and meaningful array order. Use shared strict JSON helpers and UTF-8 without BOM, two spaces, LF, and one final newline. Review captured data before adopting it into `src/game-data/data`. Keep operational details in module READMEs per the [documentation standard](docs/documentation.md).

## Testing

Run `pnpm test` for Vitest (`tests/unit/**/*.test.ts` and TypeScript integration tests). Run `pnpm test:content` for Node integration checks. Derive mechanics expectations independently from traceable sources. Use authorized recordings and skip dependent checks when originals are missing. [Evidence standard](docs/evidence-and-validation.md)

For browser or Worker changes, build resources and run relevant Playwright `*.spec.ts` cases. Use `pnpm exec playwright test tests/browser/development/inventory.spec.ts --project=chromium --workers=1` for inventory and `node tests/desktop/workspace.mjs` for packaged desktop changes. Run browser and desktop acceptance serially with one worker. [Test commands](tests/README.md)

## UI and storage

Review UI changes before implementation. Keep `WorkspaceShell`, candidate editing in `TeamLoadoutEditor`, and the Project calculator’s own loadouts and baseline. For U1 reviews, use frontend-design, web-design-guidelines, and webapp-testing against the [interface standard](docs/interface.md). Preserve [effective-roll bases](src/web/README.md#平均条数与有效条数), [import and inventory semantics](src/web/README.md#外部导入协议), and existing user files and browser storage during cleanup.

## Commits and pull requests

Obtain explicit approval before committing or pushing. Use a descriptive scoped prefix such as `feat(engine):` or `test(calculator):`. Keep dependency changes with their lockfile and patches. Describe behavior and validation in the PR, link relevant issues, and attach screenshots for UI changes. Follow the [delivery workflow](tools/README.md#构建托管与本地交付操作) for packaging and pruning.
