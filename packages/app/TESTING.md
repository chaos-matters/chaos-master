# Testing Infrastructure

This document describes the testing setup created to catch runtime errors in the Chaos Master app.

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

**Error**: `ERR_CONNECTION_REFUSED` when trying to connect to localhost:5173 or localhost:3000

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
