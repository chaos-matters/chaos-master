# Plan: Dimension-aware variation filtering (2D/3D)

Status: **planned, not implemented** (2026-06-11)

## Goal

Every surface that offers variations must offer exactly the set that the
active flame's dimension supports: in 3D mode only `transformVariations3D`
(`linear3D`, `julia3D`, …), in 2D mode only `transformVariations`
(`linearVar`, `juliaVar`, …). No mixed lists, no picks that silently render
as nothing.

This follows the established product decision (see memory:
`3d-mode-design-decisions`): 2D and 3D are separate authoring worlds — no
cross-dimension conversion of variation types. The render pipelines already
skip incompatible types defensively; this plan fixes the *pickers* so those
skips become unreachable through the UI.

## Current state (verified)

| Piece | 2D | 3D |
|---|---|---|
| Registry | `transformVariations` ([variations/index.ts](../packages/app/src/flame/variations/index.ts)) | `transformVariations3D` ([variations3D/index.ts](../packages/app/src/flame/variations3D/index.ts)) |
| Entry shape | `DescriptorSchema`, `fn`, `category`, parametric: `paramStruct`/`paramDefaults`/`editor` | `DescriptorSchema`, `fn` only — **no `category`, no parametric support** |
| Selector list source | `variationTypes` (2D-only) via `variationPreviewFlames()` | — (3D types never listed) |
| Preview flame factory | `getDefaultFlameByVarType` + curated `previewFlames` overrides ([variations/utils.ts](../packages/app/src/flame/variations/utils.ts)); 2D affines, `pointInitGaussianDisk` | — |
| Preview camera | `Camera2D` (tiles), `WheelZoomCamera2D` (final preview) | `Default3DPreviewCamera` exists ([Camera3D.tsx](../packages/app/src/lib/Camera3D.tsx)), used by gallery thumbnails only |
| Categories | `CATEGORIES`/`CATEGORY_LABELS`/`sortByCategory` ([categories.ts](../packages/app/src/flame/variations/categories.ts)); note: a `'3d'` category **already exists but is unused** | none assigned |

Variation entry points that must become dimension-aware:

1. **VariationSelector modal** ([VariationSelector.tsx](../packages/app/src/components/VariationSelector/VariationSelector.tsx)) — tile list, category pills, search, tile previews, final flame preview, point-init select, params editor, affine editor, apply path.
2. **Sidebar / workspace actions** ([MainWorkspace.tsx](../packages/app/src/MainWorkspace.tsx)) — `getVariationDefault('linearVar', …)` call sites: add-transform (~line 123), symmetry generators (~341, ~355), add-variation row (~2329), variation type-switch (~1827, ~2247), quick-picker hover swap (~430).
3. **Command palette** ([commands/builtins/flame.ts](../packages/app/src/commands/builtins/flame.ts)) — add-variation commands built from the 2D registry.
4. **Randomizer** ([randomize.ts](../packages/app/src/flame/randomize.ts)) — generates 2D-only flames.

## Design decisions

**D1 — Registry switch, not category tag.** Filtering is by *registry per
dimension*, selected from the active flame's `renderSettings.dimensions`.
The pre-existing `'3d'` category is **not** used to mix 3D entries into the
2D list (that would contradict the separate-worlds decision); it gets
removed or kept only as a reserved label. Within the 3D list, categories
describe function (`general`, `blur`, …) exactly like 2D.

**D2 — One neutral lookup module.** New `flame/variationRegistry.ts`:

```ts
type Dims = 2 | 3
getVariationRegistry(dims)   // transformVariations | transformVariations3D
variationTypesFor(dims)      // recordKeys of the above
isVariationTypeFor(dims, t)  // membership test
categoryOf(dims, t)          // VariationCategory | undefined
defaultLinearType(dims)      // 'linearVar' | 'linear3D'
```

Type level: `AnyVariationType = TransformVariationType |
TransformVariationType3D` (already exists implicitly in
`getVariationDefault`'s signature — formalize it here).

**D3 — Dimension comes from the flame, not new plumbing.** The selector
already receives `currentFlame`; sidebar actions already mutate
`flameDescriptor`. Everything derives `dims =
flame.renderSettings.dimensions ?? 2`. No new context/providers.

**D4 — Previews render in their native dimension.** 3D variation tiles and
the final preview render through a 3D camera; reuse
`Default3DPreviewCamera` for tiles and `WheelZoomCamera3D` (local
`createSpherical(0, π/2, 5, origin, 60)`) for the orbitable final preview.

## Phases

### Phase 0 — registry parity groundwork (small)

- Extend `simpleVariation3D(key, impl)` →
  `simpleVariation3D(key, impl, category)` mirroring the 2D
  `simpleVariation` signature; categorize the ten existing 3D variations
  (`gaussian3D` → `blur`, rest → `general`).
- Add `flame/variationRegistry.ts` (D2). Pure addition; nothing consumes it
  yet.
- Decide fate of the unused `'3d'` category constant (remove from
  `CATEGORIES` or leave reserved; removing keeps the pill row honest).

### Phase 1 — 3D preview flame factory (medium)

- Widen `transformPreviewIds` (in [variations/utils.ts](../packages/app/src/flame/variations/utils.ts))
  to cover both registries — type names cannot collide (`…Var` vs `…3D`),
  so `getTransformPreviewTid/Vid` just accept `AnyVariationType`.
- `getDefaultFlameByVarType3D(type)`: `dimensions: 3`, 12-component
  identity pre/post affines, `pointInitMode: 'pointInitUnitBall'`,
  `skipIters` small (1–2), single variation weight 1, exposure tuned once.
- Empty curated `previewFlames3D` override map (same pattern as 2D); tune
  per-variation entries later (julia3D, spherical3D likely want zoomed-out
  orbits / lower exposure).
- Unified accessor `getVariationPreviewFlame(type, dims)` (or a parallel
  `…3D` function — pick whichever keeps the 2D signature untouched).

### Phase 2 — VariationSelector dimension awareness (the bulk)

All inside [VariationSelector.tsx](../packages/app/src/components/VariationSelector/VariationSelector.tsx):

- `const dims = () => (props.currentFlame.renderSettings.dimensions ?? 2)`.
- `variationPreviewFlames(pointInitMode)` →
  `variationPreviewFlames(dims, pointInitMode)`; both the store init and the
  point-init-change rebuild loop go through it. List source becomes
  `variationTypesFor(dims)`.
- Grouping & pills: replace `transformVariations[type]?.category` with
  `categoryOf(dims, type)`. With Phase 0 done, no other changes.
- **Tile previews** (`VariationPreview`): wrap Flam3 in
  `Default3DPreviewCamera` when the preview flame is 3D, `Camera2D`
  otherwise (same `Show`/fallback pattern as the load-flame modal
  `Preview`).
- **Final preview** (`PreviewFinalFlame`): in 3D use `WheelZoomCamera3D`
  with local spherical state. The zoom-% button shows radius (or hides);
  reset sets radius 5 / theta 0 / phi π/2.
- **Point-init select** (footer): list `pointInitMode3DToImplFn` keys when
  `dims === 3` (mirror of the sidebar dropdown fix already shipped).
- **Params editor**: unreachable for 3D today (no parametric 3D
  variations); add a registry-scoped guard so a future parametric 3D type
  routes to its own editor rather than the 2D lookup.
- **Affine editor**: 2D-only widget (6 components). In 3D mode hide it
  behind a "2D only" note for v1; a 12-component 3D affine editor is its own
  future feature.
- **Apply path**: `applySelection` copies `previewTr.preAffine` —
  verify the merge handles 12-component objects (plain copy, should be
  fine); the responded `variation` descriptor is already
  dimension-correct because the preview flames are.
- **Search**: `getNormalizedVariationName` strips `Var$` only; also strip
  `3D$` so "linear" matches `linear3D` (display name decision: show the
  stripped name — the modal is already dimension-scoped, the suffix is
  noise).

### Phase 3 — remaining entry points (small)

- MainWorkspace: replace hard-coded `'linearVar'` defaults with
  `defaultLinearType(dims)` at the add-transform and add-variation sites.
  Symmetry generators inject 2D affine flips — **disable the symmetry menu
  in 3D mode for v1** (3D symmetry groups are a separate feature).
- Command palette (`commands/builtins/flame.ts`): build add-variation
  commands from `variationTypesFor(dims)` at invocation time (or register
  both sets and filter at query time).
- Randomizer dice: **disable in 3D mode for v1** (tooltip "2D only for
  now"); v2 = 3D randomizer drawing from the 3D registry with 3D affine
  jitter and 3D point-init modes.
- Quick-picker hover swap (~MainWorkspace:430): source its candidate list
  per dims.

### Phase 4 — polish (optional, later)

- Curate `previewFlames3D` per variation; refine 3D categories.
- Parametric 3D variations (paramStruct/editor parity) when first one lands.
- 3D affine editor; 3D symmetry tools; 3D randomizer.
- Unit tests: `variationTypesFor(3)` equals selector list in 3D; preview
  factory returns `dimensions: 3` flames; every registry entry has a
  category (typecheck via `satisfies`).

## Risks / notes

- **Modal cost**: `variationPreviewFlames` builds one descriptor per type on
  every modal open; the 3D list is tiny (10), so 3D mode is cheap. No
  regression for 2D.
- **Pipelines stay defensive**: the skip-unknown-type guards shipped earlier
  remain the safety net for hand-edited/loaded flames; the UI filter makes
  them unreachable through normal use.
- **No descriptor migration**: switching dimensions still swaps whole flames
  (per-mode memory) — nothing in this plan rewrites variation types.
- The selector currently opens from a variation row; in 3D mode rows hold 3D
  variations, so `currentVar` is already a 3D descriptor — the
  "current selection" highlight logic needs no change.

## Effort estimate

| Phase | Size |
|---|---|
| 0 — registry groundwork | ~half a day |
| 1 — preview factory | ~half a day |
| 2 — selector | 1–2 days (camera work dominates) |
| 3 — entry points | ~half a day |
| 4 — polish | open-ended, incremental |
