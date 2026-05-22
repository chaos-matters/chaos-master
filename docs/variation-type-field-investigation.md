# Variation `type` field — investigation

**Date**: 2026-05-20

## Summary

Investigation into how a `TransformVariation` could end up without a `type` field, and what happens when it does. No user-facing crashes observed — this is a defensive hardening note.

## Architecture

### Dual `FlameDescriptor` types

Two distinct types exist:

| Type | Location | Purpose |
|------|----------|---------|
| Schema `FlameDescriptor` | `flameSchema.ts:158` | valibot-validated, input/output boundary |
| Timeline `FlameDescriptor` | `timeline.ts:199` | Plain interface, `transforms: Record<string, unknown>` |

The timeline type uses `unknown` for transforms — individual variation objects are completely untyped at that layer.

### Variation schema

`TransformVariationDescriptor` (`variations/index.ts:14`) is a `v.variant('type', [...])` — valibot's discriminated union. Each variation type (simple + parametric) contributes its own descriptor schema, and `type` is the discriminator key.

### Validation gate

`validateFlame()` calls `v.safeParse(FlameDescriptor, data)`. If any variation is missing `type`, the variant discriminator fails and the entire flame load throws: _"This flame cannot be shown."_

## Creation paths (all safe)

1. **`getVariationDefault(type, weight)`** — all internal code uses this factory, and it always includes `type`.
2. **`VariationSelector.applySelection()`** — round-trips through `JSON.parse(JSON.stringify())`, which is lossless for the `type` string.
3. **`App.tsx:1119`** — guards with `isVariationType()` before applying variation selector results.

## Risk vector: externally-loaded JSON

The only way a variation can lack `type` is corrupted/malformed external data:

- Share links (flame JSON embedded in URL)
- `localStorage` import
- Manual file upload
- Hand-edited JSON

## GPU layer guards (redundant currently)

Two functions already have fallback guards that never fire because schema validation rejects bad data first:

- **`createFlameWgsl`** (`transformFunction.ts`) — filters out variations with unknown/empty type, emits `console.warn` (commit `825aff4`)
- **`extractFlameUniforms`** (`transformFunction.ts`) — checks `vtype !== undefined` before processing params (commit `2ec60a6`)

## Fix options (if needed)

### Option A: Pre-process in `validateFlame()`

Walk transforms before `v.safeParse`. For each variation missing `type`, attempt to infer from param shape. Fragile — not all variation types have unique parameter signatures.

### Option B: Schema-level optional `type` with fallback

Make `type` optional in the variation descriptor schemas, defaulting to a sentinel. The existing GPU guards would then filter these out with a warning instead of crashing the entire flame load. Least invasive approach.

### Option C: Leave as-is

Corrupt data fails loudly. Schema validation throws a clear error, and the user knows the file is bad rather than silently degrading.

## Recommendation

Option C for now — no crashes observed. The schema gate and GPU guards form a defense-in-depth pair where the inner layer is currently unreachable but costs nothing. If external-flame sharing becomes common and malformed `type` fields become a real support burden, revisit with Option B.
