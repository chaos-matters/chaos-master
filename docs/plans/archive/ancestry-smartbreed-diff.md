# Ancestry Tree + Smart Breed + Flame Diff — Implementation Plan

## Overview

Three remaining items from `genetic-flames.md`, implemented in order of
dependency and impact.

---

## 1. Ancestry Tree (Section 2)

### Data Model

```ts
// flame/ancestry.ts
interface FlameAncestry {
  flameId: string // unique ID for this ancestry node
  parentIds: [string, string] | null // IDs of parent ancestry nodes
  generation: number // 0 = root, increments each breed
  createdAt: number // Date.now()
  breedConfig: {
    crossoverMode: CrossoverMode
    mutationStrength: number
  }
  metadata: {
    name: string
    transformCount: number
    variationCount: number
  }
}
```

### Storage

`Map<string, FlameAncestry>` keyed by flame ID, persisted via
`persistentSignal` with serialize/deserialize. Stored under key
`ancestry-store`.

Since `FlameDescriptor` has no ancestry field, we use a **content hash**
(truncated SHA-256 of `JSON.stringify(flame)`) as the flame ID. This
allows looking up ancestry for any flame — we hash it, check the store.

### Recording ancestry

Add `recordBreeding(parentA, parentB, children, breedConfig)` to
`flame/ancestry.ts`. Called from Evolution Chamber and Breed Gallery
after breeding. Each child gets an ancestry node with both parents linked.

### UI — AncestryTreeModal

- Opens via button in ViewControls or from Evolution Chamber
- Takes current flame, hashes it, looks up ancestry
- Renders a **horizontal tree** (left-to-right): root flames on the left,
  descendants branching rightward
- Each node: miniature VariationPreview (128×72), flame name, generation #
- Click a node: "Load this ancestor" → applies to workspace
- Hover a node: tooltip with breed config used to create it
- If no ancestry found for current flame: show message "No lineage recorded
  — this flame wasn't bred in Chaos Master"

### Edge cases

- Flame never bred: no ancestry, show empty state
- Deep trees (>10 gens): collapsible branches, horizontal scroll
- Storage quota: max 200 ancestry entries, evict oldest via LRU

---

## 2. Smart Breed (Section 3)

### Integration point

Add `'smart'` to the `CrossoverMode` union, add to `CROSSOVER_MODES` arrays
wherever they appear (breedFlame.ts, BreedGallery, EvolutionChamber,
PopulationSimulator).

### Algorithm

Implemented as a new crossover function in `breedFlame.ts`:

```
smartCrossover(transformsA, transformsB, count):
  1. For each transform in both parents, determine its "type signature":
     - The variation type with the highest weight is the dominant type
     - If tied, use the first alphabetically
  2. Build matching pairs:
     - For each dominant type present in BOTH parents, pair one transform
       from A with one from B (favoring higher-weight transforms first)
  3. Cross-breed each matched pair:
     - Interleave affine coefficients (random per-coef from A or B)
     - Interleave variation weights/params for same-type variations
     - Average color with slight perturbation
  4. Collect unmatched transforms from both parents
  5. Fill requested count:
     - First from cross-bred pairs (up to count)
     - Then from unmatched transforms
     - Re-ID all variations for uniqueness
  6. Return selected transforms
```

### BreedConfig extension

Add optional `smartBreedCrossColor` and `smartBreedCrossVariations`
flags (default true) to control whether smart breed also cross-breeds
colors and variation params within matched pairs.

### Dispatch

Add `case 'smart': selected = smartCrossover(...)` to the crossover
switch in `breedFlames()`.

---

## 3. Flame Diff View (Section 5)

### Diff engine — `flame/fdiff.ts`

```ts
interface FlameDiff {
  summary: {
    similarityPct: number
    transformCountDiff: { a: number; b: number }
    totalVariationsDiff: { a: number; b: number }
  }
  transforms: {
    matched: MatchedTransform[] // pairs found in both
    onlyInA: TransformSummary[] // unique to flame A
    onlyInB: TransformSummary[] // unique to flame B
  }
  colors: {
    avgOkLabDistance: number
  }
  renderSettings: {
    changed: string[] // list of changed setting keys
  }
}

interface MatchedTransform {
  summaryA: TransformSummary
  summaryB: TransformSummary
  affineDiff: Record<string, { a: number; b: number; delta: number }>
  variationDiffs: VariationDiff[]
  colorDiff: { distance: number }
  probabilityDiff: { a: number; b: number }
}
```

### Matching strategy

Match transforms between A and B by:

1. Try exact variation type set match first
2. Fall back to best partial match (most overlapping variation types)
3. Unmatched transforms go into `onlyInA` / `onlyInB`

### Similarity score

Weighted composite: transform matches (40%), affine similarity (25%),
variation similarity (25%), color similarity (10%).

### UI — DiffViewModal

- Modal with two columns: Flame A (left) vs Flame B (right)
- Top: similarity percentage badge ("73% similar")
- Transform section:
  - Matched transforms side by side, affine delta highlighted
  - Green background for additions (onlyInB), red for removals (onlyInA)
  - Yellow highlight on affine coefficients that changed > 5%
- Variation section: type + weight comparison, parametric diffs
- Color section: swatches with OkLab distance label
- Render settings: compact key=value diff list

### Entry points

- Evolution Chamber: "Compare with Parent" button on selected child
- Breed Gallery: "Compare" button between parent and child
- Ancestry Tree: "Compare with Ancestor" button on any node

### Wiring

- Takes two FlameDescriptors + optional names
- Modal opened via `_requestModal` pattern (provides Root context)
- Not a standalone workspace button — it's contextual

---

## Implementation Order

1. **Smart Breed** — simplest, pure algorithm work in breedFlame.ts
2. **Ancestry Tree** — data layer + UI, depends on breed events existing
3. **Flame Diff View** — utility + UI, enriches Evolution Chamber + Ancestry

## Files

| Feature       | New files                                                   | Modified files                                                  |
| ------------- | ----------------------------------------------------------- | --------------------------------------------------------------- |
| Smart Breed   | —                                                           | `breedFlame.ts`, 4 components that list crossover modes         |
| Ancestry Tree | `flame/ancestry.ts`, `AncestryTreeModal.tsx`, `.module.css` | `MainWorkspace.tsx`, `BreedGallery.tsx`, `EvolutionChamber.tsx` |
| Flame Diff    | `flame/fdiff.ts`, `DiffViewModal.tsx`, `.module.css`        | `EvolutionChamber.tsx`, `AncestryTreeModal.tsx`                 |

## Edge Cases

- **3D flames**: smart breed works across 2D and 3D variation types independently
- **Empty transforms**: ancestry records "no transforms" metadata gracefully
- **Very different flames**: diff shows 0% match, all transforms in onlyInA/onlyInB
- **Large ancestry trees**: horizontal scroll + collapse, max 200 nodes
- **Cross-session ancestry**: persists in localStorage, survives page reloads
