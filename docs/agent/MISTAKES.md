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

**What happened.** `src/stores/workspaceLayoutStore.ts` exports `isPhone`,
`isTablet` and `isTouchLayout` as `createMemo` calls at module scope (lines
114, 120, 126). They run at import time, outside any `createRoot`, so Solid
emits `computations created outside a 'createRoot' or 'render' will never be
disposed` — three times, on every page load, on every route, at every viewport.

**Why it was not obvious.** Nothing fails. There are zero console _errors_, the
app renders correctly, all 2,529 unit tests pass, and the warning is easy to
scroll past. It surfaced only when a headed browser run captured `console.warn`
with a stack trace.

**The rule.** A global memo must be wrapped in an explicit `createRoot`, or
moved inside the store factory / component that owns it. If you genuinely want
a process-lifetime computation, say so in code with `createRoot` rather than
letting it happen by accident at module scope.

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

**What happened.** `MainWorkspace.tsx:38` loads `DiffViewModal` with
`lazy(() => import(...))`, but `WorkspaceSidebar.tsx:5` imports
`DiffViewContent` from that same module statically. Vite says so at build time:
`dynamic import will not move module into another chunk`. The modal ships in the
main chunk regardless of the `lazy()`.

**Why it was not obvious.** Both files are correct in isolation, and the
`lazy()` call still _looks_ like it is doing something. The warning is one line
in a long build log. It was introduced by the same commit (`5d35f893`) that
created `WorkspaceSidebar` while decomposing `MainWorkspace` — the refactor
defeated its own code-splitting goal.

**The rule.** After adding or moving a `lazy()` boundary, grep for other
importers of that module, and read the build output for
`dynamic import will not move module into another chunk`. If a sibling needs a
piece of the module, extract that piece into its own file so the heavy part
stays splittable.

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
point `tsConfig` at the root `tsconfig.json`. Correctly resolved, the graph is
1,195 modules with 8 orphans and genuinely zero cycles.

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
