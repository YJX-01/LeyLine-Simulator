# Python implementation archive

This directory preserves the pre-TypeScript implementation for historical reference. It is excluded from the pnpm workspace, current application, CI test suites, and release artifacts. Do not import it from active code or extend it for new features.

## Original locations

| Archived path | Original path | Purpose |
| --- | --- | --- |
| `src/` | `/src/` | Python simulation, PyQt UI and assets; retired demos removed |
| `requirements.txt`, `ENV.md`, `.env` | Repository root | Historical dependencies and environment instructions |
| `.gitignore` | `/.gitignore` | Original Python ignore rules |
| `docs/dict/`, `docs/graph/` | `/docs/dict/`, `/docs/graph/` | Old usage, terminology, diagrams, and demo images |
| `PROJECT-README.md` | Python section of `/README.md` | Original introduction |

VS Code launch/settings files were intentionally removed. Root `README.md` and `AGENTS.md` describe the maintained TypeScript application. Historical Python paths in the archived material are relative to this directory.

## Historical reproduction

Start with [legacy usage](docs/dict/usage.md) and [environment notes](ENV.md). To investigate historical behavior, use this directory as the working directory and `PYTHONPATH=src`. Dependencies and instructions are preserved, not verified against current Python versions. Old mechanics require independent auditing.

The old demo scripts have been removed by user decision. Active metadata belongs in `src/game-data/data`; `docs` contains Markdown only. This archive does not supply inputs to the current generator. See [current architecture](../../docs/architecture/overview.md).
