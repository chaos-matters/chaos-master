# Symmetry System Architecture

Status: IMPLEMENTED

## Overview

The symmetry system in chaos-master-fp applies discrete symmetry groups to the IFS
(Iterated Function System) fractal flame. Each flame supports exactly **one symmetry
group** at a time, which is the correct mathematical model for IFS fractal symmetry.

## Symmetry Types

### Rotational (Cn)

- Creates `N-1` rotation transforms for N-fold rotational symmetry
- The identity transform (0-degree rotation) is implicit in the existing non-symmetry transforms
- Each rotation transform has `preAffine = { a: cos(angle), b: -sin(angle), d: sin(angle), e: cos(angle) }` where `angle = 2*pi*i/N`
- Example: 5-fold rotational = 4 explicit rotation transforms at 72, 144, 216, 288 degrees

### Dihedral (Dn)

- Same as rotational, plus one **reflection** transform
- The reflection transform uses `preAffine = { a: -1, b: 0, d: 0, e: 1 }` (reflection across Y axis)
- Dihedral N combines N-fold rotation with reflection, forming the full dihedral group Dn
- Example: Dihedral 5 = 4 rotations + 1 reflection = D5 symmetry group

## Implementation Details

### Transform Naming

All symmetry transforms use IDs prefixed with `_sym__` (e.g., `_sym__abc123`). This
prefix is used to:
- Identify symmetry transforms vs. user-defined transforms
- Detect the current symmetry group from the flame state
- Clean up symmetry transforms when the symmetry type or fold count changes

### Key Functions (MainWorkspace.tsx)

- **`applySymmetry(n, type)`**: Destructive -- deletes all `_sym__` transforms and
  recreates them. Called when the user changes the fold count or symmetry type.
- **`symTransforms()`**: Memo that filters transforms by the `_sym__` prefix.
- **`symTransformIds()`**: Stable ID list for `<For>` iteration (prevents DOM rebuild
  during angle drags).
- **`currentSymType()`**: Detects rotational vs. dihedral by checking for the
  reflection matrix pattern `(a=-1, b=0, d=0, e=1)`.
- **`currentSymFolds()`**: Counts sym transforms, adjusting for the reflection
  transform in dihedral mode.

### UI Panel

The symmetry panel in the sidebar provides:
- **Type dropdown**: Rotational or Dihedral
- **Folds scrub input**: Controls the N in the symmetry group
- **Gallery grid**: 2-column grid of compact sym items, each showing:
  - Badge (S1, S2, ... or labeled "Reflection")
  - Inline angle editor (30px circular knob with degree value inside)
  - Eye toggle (show/hide individual symmetry transform)
  - Remove button
- The panel defaults to expanded when symmetry is first added.

### AngleEditor Inline Mode

The `AngleEditor` component supports `mode="inline"` which renders a self-contained
circular knob with the degree value overlaid inside the track (no external label or
value text). CSS custom properties (`--track-size`, `--dot-size`, `--line-height`)
control sizing, allowing the symmetry gallery to use compact 30px knobs.

### Timeline / Keyframe Support

- Each symmetry angle is keyframeable via `dataParameterPath="transform.{tid}.preAffine.a"`
- When auto-keyframe is active, changing a symmetry angle keyframes all 4 rotation
  matrix components (`a`, `b`, `d`, `e`) simultaneously to maintain consistency
- The timeline system already supports `transform.{tid}.preAffine.{a-f}` paths for
  both reading (`getFlameValue`) and writing (`setFlameValue`)
- Type and Folds are **not keyframeable** because they are structural parameters
  (adding/removing transforms), not continuous numeric values

### Density Estimation Pipeline Optimization

The density estimation filter pipeline (`qualityK` and `estimatorCurve` parameters)
was optimized to avoid recreating GPU pipelines on every slider change. The
`runAdaptiveFilter` memo only recreates pipelines when output buffers change (e.g.,
canvas resize). A separate `createEffect` calls `setQualityK()` and
`setEstimatorCurve()` to write GPU uniform buffers directly.

## Design Decisions

1. **One symmetry group per flame**: Multiple symmetry groups would conflict
   mathematically in IFS iteration. The current model is correct.

2. **Destructive apply**: Changing folds/type rebuilds all sym transforms from scratch
   rather than trying to incrementally add/remove. This is simpler and avoids
   inconsistent states.

3. **Stable ID iteration**: The `<For>` loop iterates over `symTransformIds()` (stable
   string list) rather than `symTransforms()` (volatile object references). This
   prevents SolidJS from destroying/recreating DOM elements during angle drags, which
   would kill the active drag state.

4. **Inline angle values**: Degree values render inside the circular track to save
   horizontal space. Values are rounded to integers in inline mode for readability at
   small sizes.
