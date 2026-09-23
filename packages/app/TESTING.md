# Testing

How the Lumen Apeiron monorepo is tested: what runs where, what each kind of
test is for, and how to run the browser tests without taking someone else's
port. The strategy behind it, and the audit that shaped it, is in
[docs/agent/TESTING.md](../../docs/agent/TESTING.md); the guards and the rules
for writing a test are in
[docs/agent/CONVENTIONS.md](../../docs/agent/CONVENTIONS.md) §6.

Counts are from 2026-09-23 at `9fc08078`.

## Which checks run where

A pull request runs the CI e2e project plus the tests the branch touched. Main
runs everything.

| Check                                                      | Pull request           | Push to main, or manual dispatch |
| ---------------------------------------------------------- | ---------------------- | -------------------------------- |
| `pnpm lint`, `pnpm typecheck`                              | yes                    | yes                              |
| `@chaos-master/core` and `@chaos-master/mobile-runtime`    | in full                | in full                          |
| The app suite (`packages/app`, ~3,800 tests)               | **scoped** (see below) | in full                          |
| The `node --test` suites of the app's and the root scripts | in full                | in full                          |
| App build, landing build, `pnpm test:e2e:ci`               | yes                    | yes                              |
| `pnpm docs:cite`, in the `citations` job                   | yes                    | yes                              |
| `pnpm docs:index:check`, `pnpm metrics:check`, `pnpm arch` | no                     | yes, in the `health` job         |

The scoped run is `pnpm test:pr`, which calls `pnpm test:changed`
(`scripts/test-changed.mjs`). It runs core and mobile-runtime in full — about
230 tests in five seconds, nothing to gain by scoping them — and selects the
app's test files as the union of:

1. **What the branch touched**, via `vitest --changed <base>`: every test file
   whose module graph reaches a changed file. On CI the base is the pull
   request's base SHA from the event payload, which is why the checkout uses
   `fetch-depth: 0`.
2. **The always-on list** in `scripts/always-on-tests.mjs`: test files that
   reach their subject through `readFileSync`, `readdirSync` or
   `import.meta.glob` rather than an import. The module graph has no edge to
   what they check, so `--changed` can never select them —
   `ShellBar.module.test.ts` would sit out while `ShellBar.module.css` changed
   underneath it. Each entry carries the reason it is there.

Scoping switches off and the whole app suite runs when the branch touched the
harness itself: a `vite`/`vitest` config, a `package.json`, `pnpm-lock.yaml`, a
`tsconfig*.json`, `vitest.setup.*`, or the scoper itself —
`scripts/test-changed.mjs`, `scripts/always-on-tests.mjs` and
`.github/workflows/node.js.yml`. A change to the selection logic must not be
validated by the very selection it changes.

### Writing a test that reads the source tree

Put it on the list. `scripts/always-on-tests.mjs` is data only, and
`src/alwaysOnTestList.test.ts` enforces it: it walks every app test file, flags
the ones using `readFileSync`, `readdirSync`, `globSync`, `readFile(`,
`fs.promises` or `import.meta.glob`, and fails unless each one is on `ALWAYS_ON`
or on `EXEMPT` with a written reason. The failure names the file and says which
list to add it to, so you do not have to know any of this in advance — the test
tells you.

It guards the reverse too. Every entry carries a `genre`: `'filesystem'` means
the detector must still flag it, so narrowing the detector turns the guard red
instead of quiet; `'breadth'` marks an entry that is on the list for coverage
rather than for reading the tree. Reach for `EXEMPT` only when the module graph
genuinely does reach the test's subject.

### Cross-package changes

A change under `packages/core/src` or `packages/mobile-runtime/src` **does**
select the app tests that depend on it. Both packages resolve to TypeScript
source — core through the `@chaos-master/core` alias in `vitest.config.ts`,
mobile-runtime through the `exports` map in its `package.json` — so they are
ordinary nodes in the app's module graph rather than opaque `node_modules`
builds. Measured: a one-line change to `packages/core/src/diff/fdiff.ts`
selected **162** of 282 app test files, and one to
`packages/mobile-runtime/src/files.ts` selected **18**.

This is worth re-measuring if either package ever starts publishing `dist`
instead of source, or if the core alias is dropped: vitest's dependency walk
skips anything whose resolved path contains `node_modules`, and the cover would
disappear silently.

Run it yourself the same way CI does:

```bash
pnpm test:changed                    # against origin/main
pnpm test:changed <commit-ish>       # against something else
node scripts/test-changed.mjs --dry-run   # print the selection, run nothing
```

### The trade-off this accepts

A pull request can be green and still break main. Scoping is a bet that the
module graph plus the always-on list covers what a change can reach, and that
bet is wrong sometimes: a test the graph does not connect to the change, and
that the always-on list does not name, will not run until the merge. The
mitigation is not a cleverer selection — it is that **the merging agent runs
`pnpm typecheck` and `pnpm test` on main after every merge and stops on red**,
and that the deploy comes from main, so a red main is visible in minutes rather
than at the next release. The alternative, the full app suite on every push to
every branch, costs more than the failure mode it prevents.

---

## Unit tests: vitest

Every package tests with vitest, and every test file sits next to the code it
tests as `*.test.ts` or `*.test.tsx`: 334 files in `packages/app/src`, 16 in
`packages/core/src`, 3 in `packages/mobile-runtime`. The app's config
(`packages/app/vitest.config.ts`) runs them in happy-dom with the Solid plugin, so
components render in a test, and resolves `@chaos-master/core` to its source.

```bash
pnpm test                                        # everything, as main runs it
pnpm test:pr                                     # as a pull request runs it
pnpm --filter chaos-master exec vitest run src/utils/timeline.test.ts   # one file
pnpm test:watch                                  # the app suite, watching
pnpm test:coverage                               # app and core, v8 coverage
```

The Node scripts have their own `node --test` suites:
`pnpm --filter chaos-master test:scripts` for `packages/app/scripts`, and
`pnpm test:scripts` for the root `scripts/` (the doc citation checker). Both
run inside `pnpm test` and `pnpm test:pr`.

Coverage writes `coverage-audit/coverage-summary.json` in each package, which
`pnpm metrics` then reports; at `9fc08078` the app is at 53.22% of lines and
core at 84.89%. It is never run in CI ([docs/agent/METRICS.md](../../docs/agent/METRICS.md) §3).

## The ratchets and the test floors

`pnpm metrics:check` (the `health` job, main only) compares today's numbers
with `docs/agent/code-metrics.baseline.json` and fails when one got worse. Two
of them are floors on the test suite: `test_files` (355) and `test_cases`
(3,153), both counted statically, so deleting tests fails main even when
everything left is green. Others hold the size of the tree
(`largest_logic_file_loc`, `files_over_*`), header comments and coverage. A baseline only ever tightens, and by hand.
Run `pnpm test:coverage` before `pnpm metrics:update`: the update refuses to write a baseline that lacks a key
the old one tracked, and the coverage keys exist only after a coverage run.
`mainWorkspaceSize.test.ts` is a ratchet of the same kind that runs on every
pull request: `MainWorkspace.tsx` must have exactly the line count it names.

## Browser tests: Playwright

`tests/` holds Playwright only: the specs, their helpers (`helpers.ts`,
`pilotLock.ts`) and a reporter. Nothing in it is a unit test. The config is
the root `playwright.config.ts`. It builds the app and serves the production
preview (`pnpm --filter chaos-master e2e:serve`, `vite preview` with a
self-signed certificate on `https://localhost:4173`), then runs one of two
projects, both on headless Chromium with swiftshader standing in for a GPU:

| Project       | Specs                         | Runs                               | Today              |
| ------------- | ----------------------------- | ---------------------------------- | ------------------ |
| `chromium-ci` | `tests/*.ci.spec.ts`          | CI, every push; `pnpm test:e2e:ci` | 12 specs, 43 tests |
| `chromium`    | every other `tests/*.spec.ts` | only when someone runs it locally  | 9 specs, 32 tests  |

**Only `*.ci.spec.ts` runs in CI.** A spec in the `chromium` project is
effectively unenforced: nothing runs it for you, and several of its tests need
a real GPU to pass. A new spec should hold on the software adapter and be named
`*.ci.spec.ts`; if it cannot, say so in its header. In the CI project a skip
fails the run (`tests/reporters/failOnUnexpectedSkip.ts`) unless the test
carries an `intentional-skip` annotation with a reason.

Swiftshader is good enough to mount the app and drive its DOM, and bad at
everything a GPU does: it produces device-loss events that look like crashes.
**Never judge WebGPU behaviour from `playwright test`.** Use
`pnpm verify:webgpu` (`scripts/verify-webgpu-headed.mjs`), a headed Chrome
pass on real hardware against an already running server.

### Running e2e on a port of your own

`playwright.config.ts` pins port 4173 and reuses a server already listening
there. When 4173 belongs to someone else (a person's own preview, or another
agent), serve the build on a private port and point a local config at it:

```bash
# 1. Build once and serve it on a port of your own, say 4401.
VITE_GA_ID= pnpm --filter chaos-master exec vite build
pnpm --filter chaos-master exec vite preview --port 4401 --strictPort &

# 2. playwright.private.config.ts, next to playwright.config.ts, not committed:
#      import base from './playwright.config'
#      export default {
#        ...base,
#        webServer: undefined,
#        use: { ...base.use, baseURL: 'https://localhost:4401' },
#      }

# 3. Run one spec, or a project.
pnpm exec playwright test --config playwright.private.config.ts \
  --project=chromium-ci tests/smoke.ci.spec.ts
```

Stop the preview server by its PID or its port (`fuser -k 4401/tcp`) when you
are done, never by process name. An agent that opens a headed browser passes
`--class=agent-browser` so the window stays off the user's workspace.
