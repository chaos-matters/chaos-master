# Randomizer "Dice" Component Plan

## Problem

Users need to explore the IFS parameter space quickly. Currently there is no way to
randomize transforms, variations, affine coefficients, or colors. Users must manually
adjust every slider. This is a standard feature in Apophysis, JWildfire, and the
original flam3 `flam3-animate` tool.

## flam3 Reference

flam3 has `flam3_random01()` for generating random values in [0,1] and uses it in
`change_colors()` (palettes.c:458-474):

```c
static void change_colors(flam3_genome *g, int change_palette) {
  for (i = 0; i < g->num_xforms; i++) {
    g->xform[i].color = flam3_random01();
  }
  x0 = random_xform(g, -1);
  x1 = random_xform(g, x0);
  if (x0 >= 0 && (random()&1)) g->xform[x0].color = 0.0;
  if (x1 >= 0 && (random()&1)) g->xform[x1].color = 1.0;
}
```

Key design choices from flam3:
- Colors are randomized uniformly in [0,1]
- At least one transform gets color=0 (anchor point), one gets color=1
- This ensures the color gradient spans the full palette range

## Design

### Dice Button Component

A small, unobtrusive button that looks like a die (🎲) or shuffle icon, placed at
specific locations in the sidebar. Clicking it randomizes the associated parameter(s)
using a seeded or crypto-random source.

**Placement locations** (each is its own instance with specific behavior):

#### 1. Per-Transform Dice (next to transform color circle)

Randomizes the entire transform:
- `transform.color` — random value in [0, 1] for x, y independently
- Optionally: affine coefficients (a-f for pre/post) with small perturbation
- Optionally: variation weights

#### 2. Per-Variation Dice (next to variation weight slider)

Randomizes the variation:
- `variation.weight` — random in [0, 1]
- For parametric variations: randomize each param within its valid range
- Optionally: swap to a random variation type

#### 3. Per-Affine Coef Dice (next to each affine coef in AffineEditor)

Randomizes a single affine coefficient:
- Small perturbation (e.g., Gaussian with σ=0.2 around current value)
- Or completely random within a reasonable range (e.g., [-2, 2])
- Individual dice per coef (a, b, c, d, e, f) in pre/post affine

#### 4. Global Randomize (in action buttons bar or top of sidebar)

Randomizes all colors at once (like flam3's `change_colors`):
- Guarantees at least one transform at color=0 and one at color=1
- Randomizes all transform colors uniformly

### Random Value Generation

For the web context, use `crypto.getRandomValues()` or `Math.random()`:

```ts
function random01(): number {
  return Math.random()
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function randomPerturbation(current: number, sigma: number, clampRange?: [number, number]): number {
  // Box-Muller or simple approximation
  const u = Math.random()
  const v = Math.random()
  const gaussian = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  const result = current + gaussian * sigma
  if (clampRange) return Math.max(clampRange[0], Math.min(clampRange[1], result))
  return result
}
```

### Component API

```tsx
interface DiceButtonProps {
  /** What to randomize */
  mode: 'transform' | 'variation' | 'affineCoef' | 'globalColors'
  /** Target transform ID (for transform/variation/affineCoef modes) */
  transformId?: string
  /** Target variation ID (for variation mode) */
  variationId?: string
  /** Specific affine coef key (for affineCoef mode) */
  coefKey?: 'a' | 'b' | 'c' | 'd' | 'e' | 'f'
  /** Which affine matrix (for affineCoef mode) */
  affineType?: 'preAffine' | 'postAffine'
  /** Called to apply the randomized value */
  onRandomize: (randomizedValue: Partial<TransformFunction>) => void
}
```

### Randomization Strategies Per Mode

**Transform mode:**
```ts
{
  color: { x: random01(), y: random01() },
  // Optional: probability unchanged
}
```

**Variation mode:**
```ts
{
  weight: random01(),
  // For parametric: randomize each param independently
  params: isParametric ? randomizeParams(variation.type) : undefined,
}
```

**Affine coef mode:**
```ts
{
  [affineType]: { ...current, [coefKey]: randomPerturbation(current, 0.3, [-3, 3]) },
}
```

**Global colors mode (flam3-style):**
```ts
function randomizeAllColors(transforms: TransformRecord): TransformRecord {
  // 1. Assign random colors to all transforms
  // 2. Pick one random transform → color = (0, 0)
  // 3. Pick another random transform → color = (1, 1)
  // 4. Return updated transforms
}
```

### Visual Design

- Icon: `shuffle.svg` (24x24, stroke-width 1.5) — two crossing arrows, universally
  recognized as "randomize"
- Size: 16-18px, matching other sidebar icon buttons (Cross, Plus)
- Color: `currentColor` inheriting from the theme
- Hover: slight scale-up or color shift
- Tooltip: "Randomize [what]" on hover
- Placement: inline next to the element being randomized, not in a toolbar
- No text label needed — the dice icon is universally understood

### Undo Support

All randomizations go through `setFlameDescriptor` which is backed by
`createStoreHistory`, so every randomization is automatically undoable with Ctrl+Z.

## Implementation Steps

### Phase 1: Create shuffle SVG icon

**File**: `packages/app/src/icons/shuffle.svg` — 24x24 icon with two crossing
arrow paths.

**File**: `packages/app/src/icons/index.ts` — import and export `Shuffle`.

### Phase 2: Create randomization utility functions

**File**: `packages/app/src/flame/randomize.ts` (new)

Export:
- `random01()` — uniform [0,1]
- `randomPerturbation(current, sigma, range?)` — Gaussian perturbation
- `randomizeTransformColor()` — random color in [0,1]²
- `randomizeVariationWeight()` — random in [0,1]
- `randomizeAllColors(transforms)` — flam3-style global color randomization
- `randomizeVariationParams(variationType)` — random params within defaults range

### Phase 3: Create DiceButton component

**File**: `packages/app/src/components/DiceButton/DiceButton.tsx` (new)

Simple wrapper that renders the shuffle icon as a button with onClick handler.
Tiny — ~20 lines.

### Phase 4: Wire dice buttons into sidebar

**File**: `packages/app/src/App.tsx`

Add dice buttons at these locations:
1. **Transform header**: Next to the color circle and delete button
   - Randomizes that transform's color
2. **Variation row**: Next to the Cross delete button
   - Randomizes that variation's type (pick from available variations)
3. **Affine editor**: Small dice per coef or per affine section
   - Perturbs the coef value
4. **Global**: In the action buttons bar or near the "Add Transform" button
   - Randomizes all colors flam3-style

### Phase 5: Add variation type randomization

**File**: `packages/app/src/flame/randomize.ts`

`randomizeVariationType()` — picks a random variation from `transformVariations`
(excluding the current one). Needs access to the transformVariations map.

## Verification

1. Click per-transform dice → color changes, render updates
2. Click per-variation dice → weight changes, render updates
3. Click affine coef dice → single coef changes, render updates
4. Click global colors dice → all colors randomized, anchor points at 0 and 1
5. Ctrl+Z after any randomization → undo works
6. `pnpm typecheck` passes

## Effort Estimate

| Phase | Effort |
|-------|--------|
| 1. Shuffle icon | Tiny |
| 2. Randomization utils | Small |
| 3. DiceButton component | Tiny |
| 4. Wire into sidebar | Medium |
| 5. Variation type randomization | Small |
