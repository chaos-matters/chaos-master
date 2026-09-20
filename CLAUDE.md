# CLAUDE.md

Agent instructions live in **[AGENTS.md](AGENTS.md)** — read it. This file is a
pointer so the two cannot drift apart.

Before exploring the codebase, read **[docs/agent/INDEX.md](docs/agent/INDEX.md)**
— a generated module map with an entry point for every subsystem. It is cheaper
than grepping, and CI keeps it from going stale.

| Document                                               | Read it when                                    |
| ------------------------------------------------------ | ----------------------------------------------- |
| [docs/agent/INDEX.md](docs/agent/INDEX.md)             | Orienting, or looking for where something lives |
| [docs/agent/CONVENTIONS.md](docs/agent/CONVENTIONS.md) | Writing code                                    |
| [docs/agent/MISTAKES.md](docs/agent/MISTAKES.md)       | Before a first change in an unfamiliar area     |
| [docs/agent/TESTING.md](docs/agent/TESTING.md)         | Writing or reviewing a test                     |
| [docs/agent/METRICS.md](docs/agent/METRICS.md)         | Reading a metric, or adding a quality gate      |
| [docs/agent/CODE-HEALTH.md](docs/agent/CODE-HEALTH.md) | Deciding what to work on — measured state       |
| [docs/agent/BUGS.md](docs/agent/BUGS.md)               | Checking whether a defect is already known      |

The guardrails in full are in [AGENTS.md](AGENTS.md). The ones that must not
wait for that read:

- **Never push to `upstream`** — it is frozen. Fork branches go to `origin`.
- **Never force-push.** `--force-with-lease` only, and only for a rebase.
- **Do not commit, push, open a PR, or merge unless asked.**
- **No Claude attribution** in commits, PR bodies, or any artifact.
- **No emojis** anywhere. Use an SVG icon component.
- **Run `pnpm check`** from the repo root after any code change.
- **Never verify WebGPU with `playwright test`** — its config forces
  swiftshader and fakes device-loss crashes. Use a standalone headed script.
