# Agent mistakes — living log

Things that went wrong, and the rule that came out of each. This is the
highest-value document in `docs/agent/` because none of it is recoverable by
reading the code: it is the record of what the code _looks_ like it does versus
what it actually does.

**Read this before a first change in an unfamiliar area.** Skim the headings;
read the entry only if it touches your area.

---

## How to add an entry

Append when you (agent or human) hit something that cost real time and would
cost the next person the same. One entry, newest at the bottom of its section.

```markdown
### <short title>

**What happened.** One or two sentences.
**Why it was not obvious.** The thing that made it a trap rather than a typo.
**The rule.** What to do instead, stated so it can be followed without context.
```

---

## Solid reactivity

### Module-scope `createMemo` is never disposed

**What happened.** Until #90, `src/stores/workspaceLayoutStore.ts` exported
`isPhone`, `isTablet` and `isTouchLayout` as `createMemo` calls at module
scope. They ran at import time, outside any `createRoot`, so Solid emitted
`computations created outside a 'createRoot' or 'render' will never be
disposed` — three times, on every page load, on every route, at every viewport.

**Why it was not obvious.** Nothing failed. There were zero console _errors_,
the app rendered correctly, all 2,529 unit tests of the day passed, and the
warning is easy to scroll past. The production build does not print it at all,
so no e2e run against a production bundle could see it. It surfaced only when
a headed browser run captured `console.warn` with a stack trace.

**The rule.** A global memo must be wrapped in an explicit `createRoot`, or
moved inside the store factory / component that owns it. If you genuinely want
a process-lifetime computation, say so in code with `createRoot` rather than
letting it happen by accident at module scope. `moduleScopeComputations.test.ts`
now fails on one ([CONVENTIONS.md](CONVENTIONS.md) §3).

### An inline conditional as a JSX prop, read inside a rAF loop

**What happened.** A ternary, `&&` or `||` written directly as a JSX prop, then
read inside a `requestAnimationFrame` loop, creates a computation outside an
owner and produces the same "never be disposed" warning.

**The rule.** Hoist the expression into a `createMemo` in the component body and
pass the memo.

### Never destructure props

**What happened.** Solid props are getters. Destructuring reads each value once
at setup and the component stops updating.

**The rule.** Access `props.foo` at the point of use, or use `splitProps` /
`mergeProps`.

---

## Build and bundling

### A lazy import is defeated by any static import of the same module

**What happened.** At a5c2f26f `MainWorkspace.tsx:38` loaded `DiffViewModal`
with `lazy(() => import(...))`, but a5c2f26f `WorkspaceSidebar.tsx:5` imported
`DiffViewContent` from that same module statically. Vite said so at build time:
`dynamic import will not move module into another chunk`. The modal shipped in
the `MainWorkspace` chunk regardless of the `lazy()`, and `AudioWiringModal`
had the same problem. #90 fixed both (`2efd73fc`).

**Why it was not obvious.** Both files are correct in isolation, and the
`lazy()` call still _looks_ like it is doing something. The warning is one line
in a long build log. It was introduced by the same commit (`5d35f893`) that
created `WorkspaceSidebar` while decomposing `MainWorkspace` — the refactor
defeated its own code-splitting goal.

**The rule.** If a sibling needs a piece of a lazily loaded module, extract
that piece into its own file so the heavy part stays splittable.
`lazyBoundaries.test.ts` now fails when a lazy target is also reachable
through static imports, from the entry or from the module that lazy-loads it
([CONVENTIONS.md](CONVENTIONS.md) §4); the build warning is still worth
reading.

---

## Tooling

### dependency-cruiser silently passes when path aliases do not resolve

**What happened.** `pnpm arch` was first configured against the root
`tsconfig.json`, which has no `paths`. 2,209 of the app's imports use the `@/`
alias, so almost every edge failed to resolve. The run reported **0 circular
dependencies** — but on a graph that was missing most of its edges. It also
reported 39 "orphan" modules that were not orphans at all.

**Why it was not obvious.** It exits successfully and prints a plausible module
count. A vacuous pass looks exactly like a real pass.

**The rule.** After changing anything about the `arch` config, check that the
module count and the orphan count both look sane. `tsconfig.depcruise.json`
exists solely to give the resolver the `@/*` mapping from the repo root; do not
point `tsConfig` at the root `tsconfig.json`. A run that reports dozens of
orphans is resolving wrongly.

To check it yourself: `pnpm arch` from the repo root under Node 22, 24 or 26+
(for example with `~/.nvm/versions/node/v24.4.1/bin` first on `PATH`). It reads
`.dependency-cruiser.cjs`, which points at `tsconfig.depcruise.json`, and
prints the module and dependency counts on its last line. Correctly resolved,
the graph was 1,195 modules with 8 orphans and zero cycles on 2026-09-10. Two
cycles arrived afterwards while the check was not in CI (#86 and #105); WP1
(#114) broke both and WP2 (#115) deleted the orphans, and at `9fc08078` it is
1,309 modules and 5,537 dependencies with **zero cycles and no violations**.
Since WP3 (#116) CI enforces it: the `health` job runs `pnpm arch` on every
push to main, and a cycle or an orphan fails it.

### dependency-cruiser drops npm packages before its rules see them

**What happened.** `.dependency-cruiser.cjs` excludes every path matching
`node_modules` from the graph. Its `core-stays-pure` rule forbids
`solid-js|typegpu|@webgpu`, but an excluded module never reaches a rule, so the
rule can only ever fire on an import of `packages/app`. `@chaos-master/core`
imports `typegpu` in three files and `pnpm arch` reports no violation; with
the exclude narrowed in a probe config it reports 5.

**Why it was not obvious.** The rule is written correctly and the run is green.
Nothing says a whole class of targets was removed first.

**The rule.** A rule about third-party imports only works while those modules
stay in the graph: `doNotFollow` keeps them as leaves, `exclude` removes them.
Prove a new rule red on a planted violation before trusting its green.

**Fixed in WP3b (2026-09-23).** `exclude` no longer names `node_modules`, and
it no longer names a bare `dist` either, which would have matched every
`node_modules/*/dist/` file and dropped the same modules a second way. Core's
npm imports now reach the rules. `core-stays-pure` refuses `solid-js`,
`@webgpu/*` and any other workspace package; `core-declared-deps-only` refuses
anything that is not in core's own `dependencies`: a dev dependency, a package
only the root or the app declares, a Node built-in, an import that does not
resolve. typegpu is declared, so it passes, and `core-typegpu-frozen` keeps it
to the three files that import it today; whether core should carry it is
BUGS.md #33. Planted in `packages/core/src/utils/schemaUtil.ts`,
`@codemirror/search` (a root devDependency, browser-only), `node:fs` and
`happy-dom` were green on main and are errors now; `solid-js`, `@webgpu/types`
and an import of `packages/app` were already red, because an import that does
not resolve keeps its bare name, which the path rule matched. The graph grew
from 1,310 modules and 5,545 dependencies to 1,344 and 7,189: the 34 npm entry
files are leaves now, not gaps.

### dependency-cruiser will not run on odd-numbered Node

**What happened.** It supports `^22 || ^24 || >=26`. On Node 25 it refuses to
start.

**The rule.** CI pins Node 24, so `pnpm arch` is fine there. Locally, run it
under a supported version, e.g. by putting one on `PATH` first.

---

## Verification

### `playwright test` cannot verify WebGPU in this repo

**What happened.** `playwright.config.ts` launches chromium with
`--use-angle=swiftshader-webgl`. The software adapter produces device-loss
events that look exactly like application crashes.

**The rule.** Verify WebGPU with a standalone headed-Chrome script instead —
`packages/app/scripts/capture-readme-screenshots.mjs` has the launch flags. Pass
`--class=agent-browser` so the window lands on the hidden agent workspace and
does not interrupt the user. Confirm you are on real hardware by reading
`(await navigator.gpu.requestAdapter()).info` — it should name a real GPU, not
a software renderer.

---

## Typechecking

### A green local `pnpm typecheck` is not authoritative

**What happened.** valibot's `InferOutput` widens nondeterministically, so the
same tree can typecheck locally and fail in CI.

**The rule.** Fix the call sites CI reports. Do not try to reproduce it locally
first, and do not assume a local pass means the branch is clean.
