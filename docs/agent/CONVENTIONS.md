# Conventions — Lumen Apeiron (Chaos Master)

Derived by measuring the current tree, not aspirational. Each rule shows the
count that justifies it, so you can tell a real convention from one file's
habit. Where the codebase is genuinely split, the rule is marked **OPEN** and
the honest answer is "follow the neighbours".

Companion docs: [INDEX.md](INDEX.md) for the module map,
[MISTAKES.md](MISTAKES.md) for the failures that keep recurring.

Measured 2026-09-10 at `a5c2f26f`.

---

## 1. Naming

| Thing           | Convention                | Evidence                                                        |
| --------------- | ------------------------- | --------------------------------------------------------------- |
| Component files | `PascalCase.tsx`          | 155 / 159 in `src/components/`                                  |
| Utility modules | `camelCase.ts`            | 92 / 92 in `src/utils/`                                         |
| Hook files      | `useThing.ts(x)`          | 10 / 11 in `src/hooks/`                                         |
| Store files     | `camelCase.ts`            | 5 / 5 in `src/stores/`                                          |
| Style files     | `*.module.css`            | 107 CSS modules vs 5 plain `.css`                               |
| Tests           | `*.test.ts(x)`, colocated | 226 colocated in `src/`; only Playwright specs live in `tests/` |

**`src/lib/` is split by kind, not by case.** PascalCase for Solid components
and contexts (`Root.tsx`, `AutoCanvas.tsx`, `Camera2D.tsx`, `RootContext.ts`,
`WebgpuAdapter.ts` — 11 files); camelCase for plain helpers (8 files). Follow
that split rather than the directory.

## 2. Icons — never emojis

The repo-wide rule is no emojis in code, UI, logs, commits or PR text. The
mechanism is `vite-plugin-solid-svg` configured with
`defaultAsComponent: true`, so an `.svg` file imports directly as a Solid
component.

To add an icon:

1. Drop the `.svg` into `packages/app/src/icons/` using `kebab-case.svg`
   (60 files today).
2. Import and re-export it from `packages/app/src/icons/index.ts`, which is the
   barrel every consumer imports from.

Never inline raw `<svg>` markup in a component, and never reach past the barrel
into an individual `.svg` path.

## 3. State

Global reactive state lives in `src/stores/` (5 modules). Workspace-scoped
state lives in `src/hooks/` as `useWorkspace*` factories.

**Every `createMemo`, `createEffect` and `createResource` must have an owner.**
Creating one at module scope runs it at import time, outside any `createRoot`,
and Solid will never dispose it. `src/stores/workspaceLayoutStore.ts` currently
does this three times (`isPhone`, `isTablet`, `isTouchLayout`) and produces
three `computations created outside a 'createRoot' or 'render' will never be
disposed` warnings on every page load — see [BUGS.md](BUGS.md). Do not copy
that pattern: wrap module-level memos in an explicit `createRoot`, or move them
into the store factory.

**Never destructure props.** Solid props are getters; destructuring reads them
once and permanently breaks reactivity. Use `props.foo` at the point of use, or
`splitProps` / `mergeProps`.

## 4. WebGPU and rendering

`src/lib/` owns the device and canvas plumbing: `WebgpuAdapter.ts` acquires the
device, `Root.tsx` provides context, `AutoCanvas.tsx` owns canvas lifecycle,
and the `Camera2D` / `Camera3D` pairs own view state.

A preview canvas rendered through a Portal — which is every modal — sits
**outside** the app `Root`, so it must be given both `<Root>` and
`<ComputeGate>` again inside the Portal. `LoadFlameModal` is the reference
implementation; copy it rather than improvising.

Shader code is authored with TypeGPU. `pnpm validate-wgsl` checks that
generated WGSL avoids reserved words; it is part of `pnpm check` and is fast,
so there is no excuse for skipping it after touching a variation.

## 5. The core package

`packages/core` is the pure half: schema (valibot), math, diff, XML, utils. It
must not import the DOM, WebGPU, or Solid. Anything that can live there should,
because it is the only part of the tree that is trivially testable — and today
it holds 2 test files against the app's 226.

Note the valibot caveat in [AGENTS.md](../../AGENTS.md): `InferOutput` widens
nondeterministically, so a locally green `pnpm typecheck` is not authoritative.
CI is.

## 6. Tests

Colocate unit tests next to the code as `*.test.ts(x)`. Reserve `tests/` for
Playwright specs (13 today).

Only `tests/smoke.spec.ts` runs in CI — GitHub runners provide flaky software
WebGPU, so the rest of the Playwright suite is local and manual. **A spec
outside the smoke subset is effectively unenforced**; if you add one, either
make it GPU-independent so it can join the CI subset, or accept that nothing
will run it for you and say so in the spec's header comment.

Never verify WebGPU behaviour through `playwright test` — its config forces
swiftshader and produces fake device-loss crashes. Use a standalone headed
script, as `packages/app/scripts/capture-readme-screenshots.mjs` does, and pass
`--class=agent-browser`.

## 7. File headers

Every module should open with a comment block saying what it is and what it is
for. This is not decoration: `pnpm docs:index` harvests that block to build
[INDEX.md](INDEX.md), so a file without one appears in the map as
`(no header comment)` and the map cannot describe it.

984 of 1,055 source files currently have no header comment. That is the single
largest documentation gap in the repo and the cheapest one to close — see
[REFACTOR-PLAN.md](REFACTOR-PLAN.md).

## 8. Duplication

Prefer a shared component with props over a second copy of a surface. If the
deduplication is too large to do inline, add a task rather than shipping the
copy — the mobile and desktop layouts are the place this pressure shows up
most.
