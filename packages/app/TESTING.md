# Testing Infrastructure

This document describes the testing setup created to catch runtime errors in the Lumen Apeiron app.

## Which checks run where

A pull request runs smoke plus what the branch touched. Main runs everything.

| Check                                                      | Pull request           | Push to main, or manual dispatch |
| ---------------------------------------------------------- | ---------------------- | -------------------------------- |
| `pnpm lint`, `pnpm typecheck`                              | yes                    | yes                              |
| `@chaos-master/core` and `@chaos-master/mobile-runtime`    | in full                | in full                          |
| The app suite (`packages/app`, ~2,500 tests)               | **scoped** (see below) | in full                          |
| App build, landing build, `pnpm test:e2e:ci`               | yes                    | yes                              |
| `pnpm docs:index:check`, `pnpm metrics:check`, `pnpm arch` | no                     | yes, in the `health` job         |

The scoped run is `pnpm test:pr`, which calls `pnpm test:changed`
(`scripts/test-changed.mjs`). It runs core and mobile-runtime in full — ~118
tests, about a second together, nothing to gain by scoping them — and selects
the app's test files as the union of:

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
than at the next release. The alternative, a full 2,500-test suite on every push
to every branch, costs more than the failure mode it prevents.

---

## Created Files

### 1. Playwright E2E Tests (`e2e/console-errors.spec.ts`)

**Purpose**: End-to-end browser tests that capture console errors during rendering and interaction.

**7 Test Cases**:

1. Render app without console errors
2. Render canvas without errors
3. Handle rapid interactions without errors
4. Handle quality preset changes without errors
5. Handle slider interactions without errors
6. Handle timeline interactions without errors
7. Handle multiple rapid renders without errors

**Usage**:

```bash
# Start dev server first
pnpm start

# Run Playwright tests (requires dev server running)
npx playwright test e2e/console-errors.spec.ts
```

**Files**:

- `playwright.config.ts` - Playwright configuration with console error detection setup
- `e2e/console-errors.spec.ts` - 7 test cases for catching runtime errors

---

### 2. Vitest Integration Tests (`src/App.integration.test.tsx`)

**Purpose**: Integration tests for App component with CPU renderer mock.

**6 Test Cases**:

1. Render without console errors
2. Handle canvasSize undefined gracefully
3. Handle empty canvas gracefully
4. Render main content structure
5. Handle repeated renders without errors
6. Handle rapid state changes

**Note**: These tests require SolidJS JSX transformation configuration. Currently blocked by JSX setup complexity.

**Files**:

- `src/App.integration.test.tsx` - Unit/integration tests
- `src/App.integration.mock.tsx` - Mock file with all dependency mocks
- `src/vitest.setup.ts` - ResizeObserver polyfill
- `vitest.config.ts` - Vitest configuration (with JSX not fully configured yet)

---

## Issues Encountered

### App Integration Tests

**Problem**: Cannot render SolidJS components in vitest due to JSX transformation issues.

**Error**: `ReferenceError: React is not defined` (even though we're using SolidJS, the JSX is being transformed incorrectly)

**Potential Solutions**:

1. Configure vitest to use `vite-plugin-solid`'s JSX transformation
2. Use `h()` or `to()` functions instead of JSX syntax
3. Create separate test-only build that includes JSX transformation

### Playwright Tests

**Problem**: Dev server not starting on expected port due to port conflicts.

**Error**: `ERR_CONNECTION_REFUSED` when trying to connect to localhost:5173

**Root Cause**: Multiple processes using ports, ssl() plugin in vite config causing issues

**Workaround**: Run dev server manually first on a free port, then configure Playwright to use that port.

---

## What Works

1. ✅ **Existing unit tests**: `src/utils/*.test.ts`, `src/flame/*.test.ts` all pass
2. ✅ **Mock infrastructure**: `App.integration.mock.tsx` has all necessary mocks
3. ✅ **Vitest setup**: ResizeObserver polyfill and basic config working
4. ✅ **Playwright tests**: Code structure ready, just need working dev server

---

## Recommended Next Steps

### For Immediate Value (Playwright)

1. Fix port conflicts in dev server
2. Run Playwright tests once server is ready
3. Use Playwright as the primary CI test suite

### For Long-Term CI/CD

1. Set up proper SolidJS JSX transformation in vitest
2. Create separate test build that includes test optimizations
3. Use Playwright in CI and vitest for local development

---

## Benefits

These tests help catch:

- `Cannot read properties of undefined (reading 'x')` errors
- `Cannot destructure property 'width' of 'n(...)' as it is undefined` errors
- CanvasSize() undefined errors
- WorldToClip() undefined errors
- Runtime errors during rapid interactions
- Errors during quality preset changes
- Timeline interaction errors

**Files Modified to Fix Runtime Errors**:

- `src/lib/Camera2D.tsx` - Added canvasSize fallback
- `src/components/FlameColorEditor/FlameColorEditor.tsx` - Added null checks
- `src/components/AffineEditor/AffineEditor.tsx` - Fixed all worldToClip calls
- `src/flame/Flam3.tsx` - Added height fallback
- `src/App.tsx` - Fixed qualityPointCountLimit undefined
- `src/components/Quality/QualityPresets.tsx` - Added fillPercentage fallback

---

## Usage in CI

```yaml
# Example GitHub Actions
- name: Run Playwright E2E Tests
  run: |
    pnpm install
    pnpm start > /dev/null 2>&1 &
    sleep 10
    npx playwright test

- name: Run Vitest Unit Tests
  run: pnpm test
```
