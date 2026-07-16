# Genetic Flames — Breeding & Evolution System

A suite of genetic-algorithm-inspired features built on the Flame Breeding engine
(`breedFlame.ts`). The core breeding operation cross-breeds two parent IFS flames
via genetic crossover (uniform, weighted, shuffle, alternate) with light mutation,
producing child flames that inherit traits from both parents.

---

## 1. Evolution Chamber

**Status**: ✅ Implemented

### Concept

Auto-evolve flames across generations. The user acts as the fitness function:

1. Pick two parent flames (A, B)
2. Breed → N children
3. User selects the best children → those become next-gen parents
4. Repeat — watching the flame "evolve" toward the user's taste

### UI

- Full-screen modal with generation counter ("Gen 3 of 10")
- Gallery grid of current generation's children
- Click to select children (multi-select with checkmark overlay)
- "Evolve" button: breeds selected children as new parents
- "Back" button: revert to previous generation
- Generation history sidebar showing lineage tree
- "Take Me Back" button: re-loads the Gen-1 parents into the workspace
- Auto-evolve mode: breeds automatically at a configurable interval

### Data Model

```ts
interface GenerationalLineage {
  generation: number
  parents: [FlameDescriptor, FlameDescriptor]
  children: FlameDescriptor[]
  selectedIndices: number[] // which children were picked
  crossoverMode: CrossoverMode
  mutationStrength: number
  timestamp: number
}
```

---

## 2. Ancestry Tree

**Status**: ✅ Implemented

### Concept

Every bred flame remembers its parents. Users can:

- View a visual family tree of any flame
- Re-breed from any ancestor in the tree
- See which traits persisted across generations
- Export/import lineage data

### Data Model

- `flame/ancestry.ts` — content-hash-based lineage tracking with `persistentSignal`
- `AncestryNode` stores hash, name, parent refs, generation, and full flame descriptor
- `recordBreed()` called automatically from BreedGallery, EvolutionChamber, and PopulationSimulator
- `contentHash()` generates deterministic 64-bit ID from flame structure

### UI

- `AncestryTreeModal` — horizontal tree with VariationPreview thumbnails
- Layers ordered by generation: ancestors left → focal center → descendants right
- Click any node to make it the new focal point
- "Load selected" applies the chosen flame to the workspace

---

## 3. Smart Breed

**Status**: ✅ Implemented

### Concept

Semantically-aware crossover that matches transforms by variation type
similarity rather than random selection:

- Map each transform to its dominant variation type
- Match transforms between parents by type (swirl→swirl, julia→julia, etc.)
- Cross-breed matched pairs for more coherent children
- Unmatched transforms are shuffled/alternated as fallback

### Implementation

- `breedFlame.ts` `smartCrossover()` — classifies transforms by highest-weight variation, groups by type, cross-breeds matched pairs with per-coefficient affine inheritance, color averaging, and variation matching
- Available as `'smart'` in `CrossoverMode` across BreedGallery, EvolutionChamber, and PopulationSimulator

---

## 4. Flame Gallery — Classic .flame Imports

**Status**: ✅ Implemented

### Concept

A curated collection of classic Apophysis flame fractals that ships with
Chaos Master. Each flame is a `.flame` XML file that gets parsed through the
existing `parseFlameXml()` pipeline.

### Curated Flames

| Name               | Description                                        |
| ------------------ | -------------------------------------------------- |
| Classic Sinusoidal | Gentle sine-wave distortions, dreamy clouds        |
| Julia Dreams       | Classic Julia-set inspired flame                   |
| Horseshoe Nebula   | Spiral nebula with horseshoe variation             |
| Swirl Galaxy       | Multiple swirl transforms creating a spiral galaxy |
| Bubble Chamber     | Spherical variations with transparency             |
| Diamond Lattice    | Linear + pdj creating crystalline structures       |
| Fire Spinner       | Blur + spherical for flame-like tendrils           |
| Rings of Saturn    | Disc + julia for ring structures                   |
| Polar Coordinates  | Polar + linear for circular patterns               |
| Waves              | Sinusoidal + waves2 for ocean-like patterns        |

### UI

- Modal with categorized grid of flame previews
- Each shows a thumbnail rendered via the existing GalleryGrid
- Click to load into the workspace
- "Random Classic" button for surprise discovery
- Search/filter by variation type used

---

## 5. Flame Diff View

**Status**: ✅ Implemented

### Concept

Side-by-side comparison of two flames showing exactly what differs:

- Transform count and composition
- Affine matrices (highlight changed coefficients)
- Variation types and weights
- Color differences (OkLab distance)
- Render settings differences

### Implementation

- `flame/fdiff.ts` — greedy matching by variation type Jaccard similarity, affine coefficient comparison, color similarity, render settings comparison
- `DiffViewModal` — overall similarity percentage with color-coded score, per-setting render comparison grid, transform match breakdown with bar charts for variation/affine/color similarity, unmatched transform lists
- Accessible via "Diff…" button in ViewControls — pick a second flame to compare against the current workspace flame

---

## 6. Population Simulator

**Status**: ✅ Implemented ([plan](plans/population-simulator.md))

### Concept

Run a non-interactive genetic algorithm with automated fitness scoring:

- Define fitness criteria: symmetry, density distribution, color diversity
- Breed a large population (100+ flames)
- Score each flame automatically
- Select top performers as next-gen parents
- Run for N generations autonomously
- Present the best flame from each generation

### Fitness Heuristics

- **Symmetry score**: correlation between left/right halves of the histogram
- **Coverage score**: proportion of non-empty bins in density estimation
- **Contrast score**: variance of bin values (higher = more structure)
- **Color diversity**: spread of OkLab (a,b) across transforms

---

## 7. Mutation Lab

**Status**: ✅ Implemented

### Concept

Fine-grained mutation controls beyond the current single strength slider:

- **Affine mutation rate**: how much affine coefficients drift
- **Color mutation rate**: how much OkLab values shift
- **Variation swap chance**: probability of replacing a variation type
- **Weight mutation rate**: how much variation weights change
- **Add/remove transform chance**: structural mutations
- **Targeted mutation**: mutate only selected transforms

### UI

- Slider grid in a collapsible panel
- Presets: "Subtle", "Moderate", "Chaotic", "Structural"
- Live preview of mutation effect

---

## Implementation Order

1. ✅ Flame Breeding (`breedFlame.ts` + `BreedGallery`)
2. ✅ Evolution Chamber (current)
3. ✅ Flame Gallery — Classic .flame imports
4. ✅ Ancestry Tree — lineage tracking
5. ✅ Smart Breed — type-aware crossover
6. ✅ Mutation Lab — fine-grained controls
7. ✅ Flame Diff View — comparison tool
8. ✅ Population Simulator — autonomous evolution
