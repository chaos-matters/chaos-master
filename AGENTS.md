# Agent instructions — Lumen Apeiron (Chaos Master)

Canonical agent context. `CLAUDE.md` points here; keep the content in this file
so the two cannot drift.

**Before exploring the codebase, read [docs/agent/INDEX.md](docs/agent/INDEX.md).**
It is a generated module map with an entry point for every subsystem — cheaper
than grepping, and it cannot go stale, because CI regenerates and compares it.

| Document                                                   | Read it when                                           |
| ---------------------------------------------------------- | ------------------------------------------------------ |
| [docs/agent/INDEX.md](docs/agent/INDEX.md)                 | Orienting, or looking for where something lives        |
| [docs/agent/CONVENTIONS.md](docs/agent/CONVENTIONS.md)     | Writing code — naming, state, styling, tests           |
| [docs/agent/MISTAKES.md](docs/agent/MISTAKES.md)           | Before a first change in an unfamiliar area            |
| [docs/agent/TESTING.md](docs/agent/TESTING.md)             | Writing or reviewing a test                            |
| [docs/agent/METRICS.md](docs/agent/METRICS.md)             | Reading a metric, or tempted to add a quality gate     |
| [docs/agent/CODE-HEALTH.md](docs/agent/CODE-HEALTH.md)     | Deciding what to work on — measured state, hotspots    |
| [docs/agent/BUGS.md](docs/agent/BUGS.md)                   | Looking for known defects before reporting a new one   |
| [docs/agent/REFACTOR-PLAN.md](docs/agent/REFACTOR-PLAN.md) | Touching one of the oversized files                    |
| [docs/specs/](docs/specs/)                                 | Changing behaviour that has an EARS spec (`*.ears.md`) |

Repeatable procedures live in [.agents/skills/](.agents/skills/) — one directory
per skill, each a `SKILL.md` whose front matter says when to use it. Today:
TypeGPU and WGSL typing rules, gallery and preview layout, PR train rebase and
merge, and user preferences.

---

## Guardrails

1. **Never push to `upstream`.** `chaos-matters/chaos-master` is frozen
   (`lock_branch` + `enforce_admins`): no pushes and no PR merges. Its push URL
   is disabled locally. Feature branches go to `origin` — the fork
   `Komediruzecki/chaos-master-fp` — and PRs target the fork's `main`.
2. **Never force-push.** `--force-with-lease` is acceptable for a rebase; plain
   `--force` is not.
3. **Do not commit, push, or open a PR unless asked.** Write the code, report
   what changed, stop. The user tests first and says when to commit.
4. **Never merge a PR** without an explicit go-ahead in the current
   conversation. Report CI green and stop.
5. **No Claude attribution anywhere** — no `Co-Authored-By`, no "Generated
   with", in commits, PR bodies, or any other artifact. The user is the sole
   author. Verify with `git log --format='%an|%ae'` before merging.
6. **No emojis** in code, UI, logs, commits, or PR text. Use an SVG icon
   component from the project's icon set. (The emoji step names in
   `.github/workflows/node.js.yml` predate this rule; do not add more.)
7. **Never put real personal data in a fixture.** Not "just to get the parser
   working". Generate fixtures from the format spec and make them
   checksum-invalid so they can never be someone's real account.

---

## Build and verify

```bash
pnpm check           # typecheck + lint:fix + fmt:fix + validate-wgsl. Rewrites files.
pnpm typecheck       # core, then the app project
pnpm lint            # type-aware eslint; needs a raised Node heap
pnpm test            # core + app vitest + script tests
pnpm test:coverage   # app vitest with v8 coverage, writes coverage-audit/
pnpm test:e2e        # full Playwright suite (local only, see below)
pnpm test:e2e:ci     # the CI-stable smoke subset
pnpm ci              # lint + typecheck + test + e2e smoke
```

### Documentation and code health

```bash
pnpm docs:index         # regenerate the tables in docs/agent/INDEX.md
pnpm docs:index:check   # CI: fail if the index is stale
pnpm metrics            # measured state: size, hotspots, tests, coverage
pnpm metrics:check      # ratchet — fails only if a tracked number got worse
pnpm metrics:update     # re-freeze the baseline; say why in the commit message
```

`pnpm metrics:check` is a **ratchet, not a threshold**. It compares against
`docs/agent/code-metrics.baseline.json` and only complains about regressions.
Absolute gates on a codebase this size either never fire or are red forever,
and both teach people to ignore them — see
[METRICS.md](docs/agent/METRICS.md).

`pnpm docs:index` reads each file's **leading comment block** to build the
module blurbs. If a module shows `(no header comment)` in the index, add a
header comment to that file — do not describe it by hand in the index.

---

## Rules that have cost real time

These are not style preferences. Each one is here because ignoring it broke
something.

1. **CI is the authority on typecheck, not your machine.** A green local
   `pnpm typecheck` is not trustworthy: valibot's `InferOutput` widens
   nondeterministically, so the same tree can pass locally and fail in CI. Fix
   the reported call sites rather than chasing it locally.

2. **Never verify WebGPU through `playwright test`.** `playwright.config.ts`
   forces swiftshader (`--use-angle=swiftshader-webgl`), which produces fake
   device-loss crashes that look like application bugs. Verify with a
   standalone headed-Chrome script instead, the way
   `packages/app/scripts/capture-readme-screenshots.mjs` does.

3. **Any browser an agent launches must pass `--class=agent-browser`.** The
   Hyprland window rule matches on that class and nothing else; without it the
   window opens on the user's active workspace and wrecks screen recordings.

4. **Solid memos and effects must have an owner.** `createMemo` at module scope
   runs at import time, outside any `createRoot`, and is never disposed — Solid
   warns `computations created outside a 'createRoot' or 'render' will never be
disposed`. Put global memos inside an explicit `createRoot`, or move them
   into the component or store factory. Equally: a ternary, `&&` or `||`
   written inline as a JSX prop and then read inside a `requestAnimationFrame`
   loop produces the same warning — hoist it into a `createMemo` in the
   component body.

5. **Never destructure props in a Solid component.** It reads them once and
   breaks reactivity. Access `props.foo` at the use site, or use `splitProps` /
   `mergeProps`.

6. **A preview canvas needs its providers re-supplied inside a Portal.**
   `VariationPreview` and `AutoCanvas` require both `<Root>` and
   `<ComputeGate>`. Modals render through a Portal, which places them outside
   the app `Root`, so both must be provided again inside the modal — copy what
   `LoadFlameModal` does.

7. **Read `.agents/skills/gallery_preview_layout/SKILL.md` before touching any
   variation or preview gallery.** Use `padding-bottom` rather than
   `aspect-ratio`, keep a `min-height` floor, set `scrollbar-gutter`, gate
   mounting on visibility, and verify on both engines.

8. **Variation doc TeX needs doubled backslashes in source** for one runtime
   backslash. Doubling again turns `\\` into a line break and renders
   multi-line. Validate with MathJax `tex2svg` before committing.

9. **Prefer a shared component with props over copy-pasted UI.** If
   deduplicating is too large to do inline, add a refactor task rather than
   shipping the second copy.

---

## Versioning and releases

The app and the landing page have **separate release trains**: the app is
tagged `vX.Y.Z`, the landing package `vX.Y.Z-web`.

Patch versions may go to two digits (`0.9.9` then `0.9.10`). **Keep the minor
single-digit** — there is no `0.10.0`, and no `1.0.0` yet.
