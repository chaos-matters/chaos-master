# Conventions — Lumen Apeiron (Chaos Master)

Derived by measuring the tree, not aspirational. Each rule shows the count that
justifies it, or names the guard that enforces it, so you can tell a real
convention from one file's habit. Where the codebase is genuinely split, the
rule is marked **OPEN** and the honest answer is "follow the neighbours".

Companion docs: [INDEX.md](INDEX.md) for the module map,
[MISTAKES.md](MISTAKES.md) for the failures that keep recurring,
[CODE-HEALTH.md](CODE-HEALTH.md) for the numbers.

Measured 2026-09-23 at `9fc08078`. First written 2026-09-10 at `a5c2f26f`.

---

## 1. Naming

Counted with `git ls-files` under `packages/app/src`, tests and stories left out.

| Thing           | Convention                | Evidence                                                                                                   |
| --------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Component files | `PascalCase.tsx`          | 172 / 178 in `src/components/`; the six others are hooks and wrappers (`useAlert.tsx`, `sliderEditor.tsx`) |
| Utility modules | `camelCase.ts`            | 89 / 89 in `src/utils/`                                                                                    |
| Hook files      | `useThing.ts(x)`          | 11 / 12 in `src/hooks/`; the twelfth is the `index.ts` barrel                                              |
| Store files     | `camelCase.ts`            | 4 / 5 in `src/stores/`; `console-store.ts` is the exception                                                |
| Style files     | `*.module.css`            | 115 CSS modules vs 6 plain `.css` in `packages/app`                                                        |
| Tests           | `*.test.ts(x)`, colocated | 334 colocated in `src/`; `tests/` holds Playwright specs only                                              |

**`src/lib/` is split by kind, not by case.** PascalCase for Solid components
and contexts (`Root.tsx`, `AutoCanvas.tsx`, `Camera2D.tsx`, `RootContext.ts`,
`WebgpuAdapter.ts` — 11 files); camelCase for plain helpers (17 files). Follow
that split rather than the directory.

## 2. Icons — never emojis

The repo-wide rule is no emojis in code, UI, logs, commits or PR text. The
mechanism is `vite-plugin-solid-svg` configured with
`defaultAsComponent: true` (in `vite.config.ts`, and mirrored in
`vitest.config.ts` so an icon renders in a test), so an `.svg` file imports
directly as a Solid component.

To add an icon:

1. Drop the `.svg` into `packages/app/src/icons/` using `kebab-case.svg`
   (66 files today, all kebab-case).
2. Import and re-export it from `packages/app/src/icons/index.ts`, which is the
   barrel every consumer imports from.

Never inline raw `<svg>` markup in a component, and never reach past the barrel
into an individual `.svg` path.

## 3. State and Solid reactivity

Global reactive state lives in `src/stores/` (5 modules). Workspace-scoped
state lives in `src/hooks/` as `useWorkspace*` factories.

**Every computation has an owner.** A `createMemo`, `createEffect` or any other
computation created at module scope runs at import time, outside any
`createRoot`, and Solid will never dispose it. Three of these shipped in
`stores/workspaceLayoutStore.ts` until #90; that store now wraps its memos in
an explicit `createRoot`. Do the same for a genuinely process-lifetime
computation, or move it into the component or factory that owns it.
_Enforced by_ `moduleScopeComputations.test.ts`, which fails on any
`create*` computation that starts a line at module scope.

**An eager computation never reads a binding declared after it.**
`createMemo`, `createComputed`, `createRenderEffect`, `createDeferred`,
`createSelector` and `createResource` run their callback once, immediately, at
creation — `createResource` runs both its source and its fetcher. A callback
that reads a `const` declared further down the component body reads it in its
temporal dead zone and throws `ReferenceError`, and the error boundary replaces
the workspace. #98 did this to every blended share link, hidden behind a `&&`
that the default flame never took. `createEffect` is not eager (it runs after
the body), so it is not covered.
_Enforced by_ `eagerComputationOrder.test.ts`, in one file and across the hook
boundary: when a `useWorkspace*` hook runs a parameter while its call is still
running, the argument at the call site may not reach a binding declared later
in the caller. `tests/kitchen-sink-mount.ci.spec.ts` is the runtime net for
what the scan cannot follow: it mounts share links that turn every optional
branch of the flame on at once and fails on any page error.

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

**Code splitting.** A module the app loads with `lazy(() => import(...))` must
not also be reachable through static imports, from the entry or from the
module that lazy-loads it: the bundler folds it into the eager chunk and only
prints a warning. #90 fixed two of these (`DiffViewModal`, `AudioWiringModal`).
_Enforced by_ `lazyBoundaries.test.ts`. If a sibling needs a piece of a lazy
module, extract that piece into its own file.

## 5. The core package

`packages/core` is the pure half: schema (valibot), math, diff, XML, deep-zoom
maths, utils. It must not import the DOM or Solid, and should not import
WebGPU. Anything that can live there should, because it is the part of the
tree that is trivially testable: it holds 16 test files against the app's 334,
and 84.89% line coverage against the app's 53.22%.

`pnpm arch` enforces the rule as `core-stays-pure` for imports of
`packages/app`. It does not see npm packages today (the dependency-cruiser
config excludes `node_modules` from the graph), and core does import `typegpu`
in `math/affineTransform.ts`, `math/affineTransform3D.ts` and `utils/schemaUtil.ts`;
see [CODE-HEALTH.md](CODE-HEALTH.md) §3. Do not add another.

A module in core with a twin in the app is re-exported by the app, not copied
(`utils/easing.ts`, `utils/record.ts` and `utils/schemaUtil.ts` since #115).

Note the valibot caveat in [AGENTS.md](../../AGENTS.md): `InferOutput` widens
nondeterministically, so a locally green `pnpm typecheck` is not authoritative.
CI is.

## 6. Tests and the guards

**Unit tests** are vitest, colocated next to the code as `*.test.ts(x)`.
`tests/` holds Playwright specs only (21 today). The full picture of which
check runs where is in [packages/app/TESTING.md](../../packages/app/TESTING.md).

**Playwright.** Only `tests/*.ci.spec.ts` runs in CI, as the `chromium-ci`
project (12 specs, 43 tests), and a skip there fails the run unless annotated
`intentional-skip`. The other 9 specs run only in the local `chromium`
project and are **effectively unenforced**. A new spec should hold on the
software adapter CI provides and be named `*.ci.spec.ts`; if it cannot, say so
in its header comment.

**A test that reads the source tree through the filesystem** —
`readFileSync`, `readdirSync`, `import.meta.glob` — goes on the always-on list
in `scripts/always-on-tests.mjs`, because a pull request's scoped run selects
tests by the module graph and would never select it. You do not have to
remember: `alwaysOnTestList.test.ts` fails and names the list to add it to.

**The guards.** Each one is a test or a CI check, not a review comment:

| Guard                                 | What it holds                                                                                                                                            | Runs                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `moduleScopeComputations.test.ts`     | no Solid computation at module scope (§3)                                                                                                                | every test run                |
| `eagerComputationOrder.test.ts`       | no eager computation reads a later binding, including across a `useWorkspace*` hook boundary (§3)                                                        | every test run                |
| `lazyBoundaries.test.ts`              | no lazily loaded module is statically reachable (§4)                                                                                                     | every test run                |
| `mainWorkspaceSize.test.ts`           | `MainWorkspace.tsx` has **exactly** `MAX_LINES` lines (4,546 at `9fc08078`): more fails, and fewer fails until `MAX_LINES` is lowered in the same change | every test run                |
| `alwaysOnTestList.test.ts`            | every filesystem-reading test is on the always-on list                                                                                                   | every test run                |
| `tests/kitchen-sink-mount.ci.spec.ts` | share links with every optional branch on mount with no page error                                                                                       | CI e2e                        |
| `pnpm arch`                           | no import cycle, no orphan module, no `packages/app` import from core; all errors                                                                        | `health` job, main            |
| `pnpm metrics:check`                  | no tracked metric regresses, including `largest_logic_file_loc` and the test floors (`test_files`, `test_cases`)                                         | `health` job, main            |
| `pnpm docs:index:check`               | [INDEX.md](INDEX.md) matches the tree                                                                                                                    | `health` job, main            |
| `pnpm docs:cite`                      | every `file:line` citation in a living doc still names its symbol (§9)                                                                                   | `citations` job, PRs and main |

`MainWorkspace.tsx` is where new code goes to hide: put new logic in a hook
(`hooks/useWorkspace*`) or a component instead. The metrics ratchet only
tightens, and by hand; never run `pnpm metrics:update` without a coverage run
first ([METRICS.md](METRICS.md)).

**Never verify WebGPU behaviour through `playwright test`** — its config forces
swiftshader and produces fake device-loss crashes. Use `pnpm verify:webgpu`, or
a standalone headed script as `packages/app/scripts/capture-readme-screenshots.mjs`
does, and pass `--class=agent-browser`.

## 7. File headers

**The first non-blank line of every file is a comment** saying what the file
is and what it is for. This is not decoration: `pnpm docs:index` harvests that
comment to build [INDEX.md](INDEX.md), so a file without one appears in the map
as `(no header comment)` and the map cannot describe it. The test is literal:
the first non-blank line starts with `//`, `/*` or `*`. An import first, or a
doc comment on the first export further down, does not count.

999 of 1,157 source files have no header comment (`pnpm metrics`,
`missing_header_comment`). The number is a ratchet, so a **new** file without
one fails `pnpm metrics:check` on main; touching an old file is a good moment
to give it one.

## 8. Duplication

Prefer a shared component with props over a second copy of a surface. If the
deduplication is too large to do inline, add a task rather than shipping the
copy — the mobile and desktop layouts are the place this pressure shows up
most.

## 9. Citing code from a doc

A doc that points at code by line number rots silently: the code moves and the
doc keeps saying the old line. So every `file:line` citation in a living
document names the symbol it is about, and `pnpm docs:cite`
(`scripts/check-doc-citations.mjs`) fails when that symbol is no longer there.
The script's header comment is the full specification; this is the working
summary.

<!-- cite-check: skip the examples below show the syntax; they are not citations -->

1. **Syntax.** `` `path:lines` ``, where `lines` is `12`, `12-20` or
   `12,40-44`. `path` is a file name or a repo-relative path; it must match
   exactly one tracked file, so write more of it when a name is ambiguous
   (`hooks/index.ts`, not `index.ts`). `` `:40` `` on its own continues the
   file named last before it in the same paragraph, by a citation or by a code
   span holding only a path. Fenced code and HTML comments are not read.
2. **Symbol.** Put the identifier the citation is about in a code span right
   beside it, after or before, with nothing between but punctuation and at
   most one word: `` `MainWorkspace.tsx:3801` (`hideMobileSidebarToggle`) ``.
   It passes when the identifier appears on a cited line or within 5 lines of
   it. A path or a commit hash is never a symbol. Citations joined only by
   commas, spaces or "and" share the symbols beside the group.
3. **Tests.** A test file may name its test instead: `` `x.test.ts:40` "the
test title" ``, which passes when the title (or an `it.each` template that
   produces it) is within the window. A title belongs to one citation and is
   never shared across a group.
4. **No symbol is an error** in a living document. An unchecked citation is
   exactly how the ones this rule was written for went stale.
5. **History.** A citation of code as it was is pinned to a revision and
   checked there, where it cannot drift, and needs no symbol: write the
   revision right before it (`` 84ae0286 `focus.ts:181` ``, `` a5c2f26f `x.ts:9` ``),
   or wrap a whole region in `<!-- cite-check: pinned <rev> -->` ...
   `<!-- cite-check: live -->`. Use it for audit evidence and superseded
   requirements; the revision must be reachable from main. Pin to a commit
   hash, never a tag: the fork's remote has no tags, so CI's clone has none,
   and the check refuses a tag pin and names its commit (`v0.9.11` is
   `84ae0286`).
6. **Whole documents.** Changelogs, anything under `archive/`, and documents
   with a date in the file name (dated plans, reports and audits) describe the
   tree of their day and are not checked. Any other document can say so with
   `<!-- cite-check: historical <reason> -->` in its first 10 lines. A region
   can opt out with `<!-- cite-check: skip <reason> -->`; the reason is
   required, and a pin is almost always better.

<!-- cite-check: live -->

It runs on pull requests as well as main, in its own `citations` job: the
change that moves the code is the one that knows where it went. When it fails,
find where the symbol moved (`git log -L` or a search) and update the line; if
the code was deleted or rewritten, the doc's claim is what needs fixing, not
the number.
