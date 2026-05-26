# Symmetry Implementation Plan

## Status: IMPLEMENTED

## Background

Symmetry in fractal flames follows the original flam3 specification by Scott Draves. Symmetry is **global** -- it adds transforms to the flame's pool that rotate (or reflect) points without changing their color. During the chaos game, these transforms get picked like any other, creating visual symmetry across the entire image.

## What was implemented

### 1. Rotational symmetry (positive N)

For N-fold symmetry, N-1 rotation transforms are added:
- Each rotates by `2*PI*k/N` (k = 1..N-1)
- `linear` variation only (weight 1)
- `colorSpeed = 0` (prevents color washing)
- `probability = sum(existing transform probabilities)` (ensures balanced density)

### 2. Dihedral symmetry (negative N / mirror)

Adds all rotational transforms PLUS a reflection transform:
- Reflection matrix: `a=-1, b=0, d=0, e=1` (mirror across x-axis)
- Same `colorSpeed=0` and probability weighting

### 3. UI: Symmetry modal

- Modal with Rotational/Dihedral toggle
- N input (2-36 folds)
- Clear description of what each mode does

### 4. UI: Collapsible symmetry group

Symmetry transforms are grouped under a single collapsible card:
- Hidden from the main transform list (no clutter)
- "Symmetry (N)" card, collapsed by default
- Each row shows label (S1, S2...), rotation angle or "Reflection"
- Per-transform visibility toggle and delete button
- "Remove all" button to clear all symmetry at once

### 5. Readable IDs

Symmetry transforms are labeled `S1, S2, S3...` (separate numbering from regular `T1, T2, T3...`).

## Key files

| File | Change |
|------|--------|
| `packages/app/src/MainWorkspace.tsx` | Symmetry modal, handler, group card |
| `packages/app/src/utils/readableIds.ts` | S1/S2 labeling for symmetry transforms |
| `packages/app/src/flame/transformFunction.ts` | `generateTransformId('sym')` prefix |

## flam3 comparison

| Aspect | flam3 | Ours | Status |
|--------|-------|------|--------|
| N-1 rotation transforms | Yes | Yes | Done |
| `colorSpeed: 0` | Yes | Yes | Done |
| Dihedral (reflection) | Yes (negative N) | Yes (toggle) | Done |
| Weight = sum(others) | Yes | Yes | Done |
| `symmetry` metadata field | Yes | No (low priority) | Skipped |
| `animate` field | Yes | No (low priority) | Skipped |

## Future improvements

- **Inline UX**: Replace the modal with an inline expandable row near the "Add symmetry" button to avoid context switching
- **`animate` metadata**: Add to symmetry transforms so they can be excluded from keyframe interpolation
- **`symmetry` field on genome**: Bookkeeping-only; low priority
