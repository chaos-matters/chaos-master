# Typecheck CI↔Local parity (issue #30) — root cause, fix, follow-ups

Branch: `feat/typecheck-ci-parity`.

## TL;DR

Local `pnpm typecheck` could pass while CI failed on the **same commit** (and
`as any` casts had crept in). Root cause: the typecheck program was ingesting the
built `dist/` bundles, which pushed TypeScript over a complexity threshold where
it **silently widens valibot's `v.InferOutput<…>` to `any`** — so local
type-checking went blind. Fixed by excluding build output from the typecheck.
After the fix, `noImplicitAny:true` drops from ~2354 errors to **90**, so real
strictness is now tractable.

## Root cause (proven)

- `packages/app/tsconfig.json` had **no `exclude`** and `allowJs: true`. The
  default file glob therefore pulled in the built bundles
  `dist/assets/index-*.js` (~2.8 MB) + `tex-svg-*.js` (~1.8 MB) of *minified* JS.
- ~4.6 MB of minified JS pushes the program over an internal TypeScript checker
  complexity threshold. Past it, tsc **silently widens** deep generic
  instantiations — all of valibot's `InferOutput` — to `any`. No error, no
  `TS2589`.
- Verified with an exact-any probe (`type IsAny<T> = 0 extends 1 & T`):
  - the same tsconfig resolves valibot correctly for a 1-file program but yields
    `any` for the full program → it's **scale**, not valibot, not schema size
    (a 2-field toy schema is `any` too), not `noImplicitAny`/`skipLibCheck`
    (both tested — no effect);
  - **with `dist/` → reliably `any`; without `dist/` → resolves.** Excluding
    `dist`/`e2e` makes the full program resolve reliably (5/5 under stress).
- A secondary contributor: the app mixes `@/valibot` (20 files) and direct
  `valibot` (4 files); the two module identities defeat instantiation caching and
  add load (see follow-up F1).

### Why local ≠ CI

CI (`.github/workflows/node.js.yml`) runs **`typecheck` before `build`**, so CI
has **no `dist/`** at typecheck time → valibot resolves → CI catches real type
errors. Locally a stale `dist/` from a prior build pushes you over the threshold
→ `any` → local typecheck passes blind. It was never nondeterministic; it was
`dist/` presence. (The project sits close to the threshold, so near it the result
is marginal — `dist/` is what reliably tips it.)

### Reproduce it

`assets/local/valibot-any-mwe/` (gitignored): `node …/run.mjs` prints

```
A) real config (dist/ in program)  : any
B) real config (dist/ removed)     : resolved
C) real opts + exclude dist/e2e    : resolved
```

`probe-a/b/c.ts` hold the `IsAny` assertions; the runner only greps tsc output
for the probe filenames (0 probe errors ⇒ valibot is `any`).

## The fix (applied)

`packages/app/tsconfig.json`:

```jsonc
"exclude": ["dist", "e2e", "node_modules"]
```

Build output must never be in the typecheck. `exclude` overrides tsc's default,
so `node_modules` is listed explicitly. After this, the idiomatic
`type X = v.InferOutput<typeof Schema>` (valibot's recommended pattern) resolves
locally and matches CI — no hand-written interfaces or runtime parity tests
needed.

## Also landed on this branch

- **Single source of truth for `FlameDescriptor`** — deleted the hand-written
  duplicate `interface FlameDescriptor` in `utils/timeline.ts` (it had silently
  drifted: missing `plotsPerChain`/`autoExposure3D*`, and put `edgeFadeColor` at
  the **wrong nesting level** — top-level instead of under `renderSettings`).
  `timeline.ts` now re-exports the schema's type. **Keep.**
- **`edgeFadeColor` bugfix** (exposed once the typecheck stopped widening to
  `any`): the timeline `edgeFadeColor` track and two animation-export lines
  wrote to a dead top-level `flame.edgeFadeColor`; the renderer reads
  `flame.renderSettings.edgeFadeColor`. The animated edge fade never applied.
  Fixed to the canonical path.
- **Unsafe-cast cleanup** — `src/types/browser.d.ts` ambient augmentation
  replaces ~10 `(navigator/performance/info as any).field` casts; the
  `FlameDescriptor` `JSON.parse(JSON.stringify())` bridges → `deepClone`;
  `applyTimelineToFlameAtFrame` narrowed to `Pick<TimelineState,'tracks'|'config'>`
  (drops an `as any` stub). Load-bearing valibot variation-factory casts left
  as-is.
- **Pre-push hook** — `.githooks/pre-push` runs `typecheck + lint + fmt`,
  auto-installed via root `package.json` `"prepare"` (`core.hooksPath`).
- **Reverted** the explicit `RenderSettings`/`CameraObj`/`Camera3DObj` interfaces
  + runtime parity test back to idiomatic `InferOutput` — they were a workaround
  for the now-root-caused problem.

## Follow-ups

- **F1 — Standardize valibot imports on `@/valibot`.** 4 files import direct
  `valibot` (`flame/variations/parametric/types.ts`, `simple/types.ts`,
  `simple3D/types.ts`, `parametric3D/types.ts`). Routing them through `@/valibot`
  removes the duplicate module identity, restores instantiation caching, and adds
  threshold headroom. Low risk.
- **F2 — Strictness, incrementally.** Post-fix measurement (`noImplicitAny:true`):
  **90 errors** (was ~2354 with valibot poisoned), of which **88 are TS7053**
  (implicit-any dynamic index access), concentrated in `flame/variations/utils.ts`
  (54) and `MainWorkspace.tsx` (23), plus 1 TS2352 + 1 TS2322. Plan:
  1. Type the dynamic index sites in `variations/utils.ts` + `MainWorkspace.tsx`
     (index signatures / `recordEntries` / branded keys) to clear the TS7053s.
  2. Flip `noImplicitAny: true` in the app tsconfig.
  3. Re-enable the `@typescript-eslint/no-unsafe-*` rules (currently 5 off) one at
     a time; measure each.
  4. Drop the per-line `@typescript-eslint/no-explicit-any` disables once the
     remaining `as any` are gone (only the load-bearing variation-factory casts
     should remain — revisit those last).
  Note: the old eslint comment attributing ~1900 implicit-anys to TypeGPU/Solid
  was measured under the poisoned-valibot state; re-measure governs the real plan.
- **F3 (optional) — Typecheck config files separately.** `vite.config.ts`,
  `vitest.config.ts`, `playwright.config.ts` are no longer in the main typecheck
  (they were never `src`). Add a small `tsconfig.node.json` if you want them
  covered.

## References

- valibot recommends `type X = v.InferOutput<typeof Schema>` — <https://valibot.dev/guides/infer-types/>
- `allowJs` ingesting `dist` is a documented gotcha — <https://www.typescriptlang.org/tsconfig/#exclude>
