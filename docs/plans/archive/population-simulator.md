# Population Simulator — Implementation Plan

## Overview

Autonomous genetic algorithm that breeds a population of IFS flames across
multiple generations with automated fitness scoring. No user interaction needed
during the run — the simulator evaluates every flame, selects top performers,
breeds the next generation, and presents the best results.

## Architecture

```
PopulationSimulator (modal component)
  ├─ Controls (population size, generations, selection, etc.)
  ├─ Progress display (gen counter, best score, elapsed time)
  ├─ Live gallery (best flames of current generation)
  └─ After completion: best-of-run gallery with apply buttons
```

### Key Files

- `packages/app/src/components/PopulationSimulator/PopulationSimulator.tsx` — modal
- `packages/app/src/components/PopulationSimulator/PopulationSimulator.module.css` — styles
- `packages/app/src/flame/fitness.ts` — scoring functions
- `packages/app/src/MainWorkspace.tsx` — wiring (new modal entry point)

## Fitness Scoring (`flame/fitness.ts`)

Descriptor-based scoring — no GPU rendering needed. Each heuristic returns 0–1.

### Heuristics

1. **Variation Diversity** — entropy of variation type distribution
   - Count each variation type across all transforms
   - Compute Shannon entropy of the distribution
   - Normalize to 0–1 (higher entropy = more diverse)

2. **Transform Balance** — how evenly weighted transforms are
   - Compute the coefficient of variation of transform probabilities
   - Lower CV = more balanced = higher score

3. **Color Spread** — OkLab color diversity across transforms
   - Pairwise OkLab distance between all transform colors
   - Higher spread = more colorful = higher score

4. **Structural Complexity** — weighted composite
   - Transform count (3–6 is ideal range, bell curve scoring)
   - Variations per transform (more is better, capped)
   - Parametric variation count (having params adds complexity)

### Composite Score

Weighted sum: `0.25 * diversity + 0.20 * balance + 0.25 * colorSpread + 0.30 * complexity`

## Selection Strategies

1. **Truncation** — top X% survive, breed to fill population
2. **Tournament** — pick K random candidates, best one wins (repeat for each slot)
3. **Roulette Wheel** — probability proportional to fitness score  
   Default: truncation at 30%

## Evolution Loop

```ts
for (let gen = 0; gen < generations; gen++) {
  // 1. Score population
  const scored = population.map((f) => ({ flame: f, score: scoreFlame(f) }))

  // 2. Select parents (top N% or tournament)
  const parents = select(scored, selectionStrategy, selectionPressure)

  // 3. Breed next generation
  const children = []
  for (let i = 0; i < populationSize; i++) {
    const [a, b] = pickTwoRandom(parents)
    children.push(...breedFlames(a, b, breedConfig))
  }

  // 4. Apply mutation
  const mutated = children.map((c) =>
    mutateFlame(c, mutationConfig, mutationOptions),
  )

  // 5. Optional: elitism (keep top 2 from previous gen)
  population = mutated

  // 6. Yield to UI for progress update
  await yieldToUI()
}
```

### Elitism

Keep the top 2 flames from each generation unchanged to prevent score regression.

## UI Design

### Controls (collapsible panel)

| Control            | Type   | Default    | Range                              |
| ------------------ | ------ | ---------- | ---------------------------------- |
| Population Size    | Slider | 48         | 16–128                             |
| Generations        | Slider | 10         | 3–50                               |
| Selection Pressure | Slider | 30%        | 10%–60%                            |
| Crossover Mode     | Pills  | uniform    | uniform/weighted/shuffle/alternate |
| Mutation Strength  | Slider | 0.2        | 0–0.5                              |
| Selection Strategy | Pills  | truncation | truncation/tournament/roulette     |

### Progress Display

- Top bar: "Gen 7 of 20 · Best 0.73 · 12.4s elapsed"
- Progress bar filling across generations
- Live gallery grid of top 9 flames from current generation
- Pause/Resume/Stop buttons

### Results View (after completion)

- "Best of Run" gallery showing #1, #2, #3 flames
- Generation-by-generation gallery: best flame of each gen
- Each flame has "Apply" button to load into workspace
- Line chart: best/average fitness per generation (optional — could skip for MVP)

### Async Execution

Use `setTimeout(fn, 0)` between generations to keep UI responsive. The loop
checks a `running` signal before each generation so it can be paused/stopped.

## Wiring (MainWorkspace.tsx)

Add a "Population Simulator…" button near the Evolution Chamber button.
Opens via `_requestModal` pattern (provides Root context for VariationPreview).

```ts
function pickPopulationSimulator() {
  void _requestModal({
    content: ({ respond }) => (
      <PopulationSimulator
        flame={flameDescriptor}
        hardwareTier={props.hardwareTier}
        onApply={(flame) => { history.replace(deepClone(flame)) }}
        respond={respond}
      />
    ),
  })
}
```

## Edge Cases

- **Empty population**: initial generation uses `generateRandomFlame`
- **Score ties**: secondarily sort by structural complexity
- **All same score**: fallback to random selection
- **Very small population (< 4)**: minimum 4 enforced
- **3D flames**: fitness scoring works on the descriptor regardless of dims
- **Memory**: population cap at 128 flames, generations cap at 50
- **Browser tab hidden**: `requestAnimationFrame` throttling is fine — the async
  loop uses setTimeout, not rAF, so it keeps running (just slower)
- **Cancel mid-run**: stop signal checked between generations, current gen
  finishes before stopping

## Implementation Steps

1. Create `flame/fitness.ts` — scoring functions
2. Create `PopulationSimulator.tsx` — main component
3. Create `PopulationSimulator.module.css` — styles
4. Wire into `MainWorkspace.tsx` — button + modal call
5. Run `pnpm check` and fix any issues
6. Commit and push
