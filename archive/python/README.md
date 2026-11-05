# Python implementation archive

This directory preserves the pre-TypeScript implementation for historical reference. It is excluded from the pnpm workspace, current application, CI test suites, and release artifacts. Do not import it from active code or extend it for new features.

## Original locations

| Archived path | Original path | Purpose |
| --- | --- | --- |
| `src/` | `/src/` | Python simulation, PyQt UI, demos, and assets |
| `requirements.txt`, `ENV.md`, `.env` | Repository root | Historical dependencies and environment instructions |
| `.gitignore` | `/.gitignore` | Original Python ignore rules |
| `docs/dict/`, `docs/graph/` | `/docs/dict/`, `/docs/graph/` | Old usage, terminology, diagrams, and demo images |
| `PROJECT-README.md` | Python section of `/README.md` | Original introduction |

VS Code launch/settings files were intentionally removed. Root `AGENTS.md` predates this move and remains unchanged; its root `src/` reference now means `archive/python/src/`.

## Historical reproduction

Start with [legacy usage](docs/dict/usage.md) and [environment notes](ENV.md). To investigate historical behavior, use this directory as the working directory and `PYTHONPATH=src`. Dependencies and instructions are preserved, not verified against current Python versions. Old mechanics require independent auditing.

Active snapshots in `/docs/constant/` and `/docs/characters/` remain outside the archive: the TypeScript generator consumes the constants and mechanics documentation cites character records. See [current architecture](../../docs/architecture/overview.md).
