# Animation Examples System

This document describes the animation examples system and how to define new animations.

## Architecture

```
animations.ts          LoadFlameModal.tsx        App.tsx
─────────────          ──────────────────        ───────
AnimationDef[]   →     Animation section    →    createEffect
(getAnimationFlame)    (click → respond)         (watch loadedAnimation)
                                                 ↓
                                           timeline.setTracks()
                                           timeline.play()
```

## Data Flow

1. **`animations.ts`** defines `AnimationDef` objects — each has an `id`, `name`, `description`, `exampleId` (key into the examples map), and `tracks` (array of `TimelineTrack`).

2. **`LoadFlameModal`** renders an "Animation Examples" section below the Example Gallery. Each animation is a clickable row showing the example ID, animation name, and description.

3. When clicked, the modal calls `respond({ flame, tracks })` instead of `respond(flame)`. The `createLoadFlame` factory detects the `tracks` property and sets a `loadedAnimation` signal.

4. **`App.tsx`** has a `createEffect` that watches `loadedAnimation()`. When non-null, it applies the tracks to the timeline, enables animation, sets loop mode, goes to frame 0, and starts playback. The signal is then cleared so re-selecting works.

## Defining a New Animation

Add an `AnimationDef` to `packages/app/src/flame/examples/animations.ts`:

```typescript
const myNewAnim: AnimationDef = {
  id: 'ex1-my-animation',        // unique identifier
  name: 'My Animation',          // display name
  description: 'What this does', // one-line description
  exampleId: 'example1',         // key from examples map
  tracks: [
    {
      parameterPath: 'exposure', // timeline parameter path
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.5, easing: 'easeInOut' },
        { frame: 90, value: 0.25 },
      ],
    },
    // ... more tracks
  ],
}
```

Then add it to the `animationDefs` array at the bottom of the file.

## Parameter Path Reference

Paths follow the dotted convention used by `applyTimelineToFlame` in `utils/timeline.ts`:

### Global Parameters

| Path              | Type     | Description          |
|-------------------|----------|----------------------|
| `exposure`        | number   | Render exposure      |
| `skipIters`       | number   | Skip iterations      |
| `vibrancy`        | number   | Palette blend (0–1)  |
| `palettePhase`    | number   | Palette phase offset |
| `paletteSpeed`    | number   | Palette cycle speed  |

### Camera

| Path              | Type     | Description          |
|-------------------|----------|----------------------|
| `camera.x`        | number   | Camera X position    |
| `camera.y`        | number   | Camera Y position    |
| `camera.zoom`     | number   | Camera zoom level    |
| `camera.rotation` | number   | Camera rotation      |

### Transform Properties

| Path                                        | Type   | Description               |
|---------------------------------------------|--------|---------------------------|
| `transform.{tid}.probability`               | number | Transform probability     |
| `transform.{tid}.color.x`                   | number | Transform color X         |
| `transform.{tid}.color.y`                   | number | Transform color Y         |
| `transform.{tid}.preAffine.{a,b,c,d,e,f}`   | number | Pre-affine coefficients   |
| `transform.{tid}.postAffine.{a,b,c,d,e,f}`  | number | Post-affine coefficients  |

### Variation Properties

| Path                          | Type   | Description              |
|-------------------------------|--------|--------------------------|
| `{tid}.{vid}`                 | number | Variation weight         |
| `{tid}.{vid}.{paramName}`     | number | Variation parameter      |

Common variation parameter names: `power`, `dist`, `slices`, `thickness`, `rotation`, `radius`, `angle`, `scale`, `freqX`, `freqY`, etc.

### Easing Curves

Available easing values: `linear` (default), `easeIn`, `easeOut`, `easeInOut`, `bounce`, `elastic`.

## Finding Transform and Variation IDs

Transform IDs (`tid`) and variation IDs (`vid`) are hardcoded UUID-like strings in each example file under `packages/app/src/flame/examples/`. Open the example file (e.g., `example1.ts`) and look for the object keys in the `transforms` and nested `variations` records.

Example from `example1.ts`:
```typescript
transforms: {
  [tid('55d4c43f_14b8_4554_a9d1_a94eda857811')]: {    // ← this is a tid
    // ...
    variations: {
      [vid('0dd9067e_a5ff_49e6_9a33_08e818a22d51')]: {  // ← this is a vid
        type: 'pie',
        params: { rotation: 0, slices: 5, thickness: 0.5 },
      },
    },
  },
}
```

## Current Animations (16 total)

| Example | Animations |
|---------|-----------|
| example1 | Camera Pan & Exposure, Probability Dance, Pie Slices & Swirl |
| example2 | Julia Power Wave, Camera Cruise, Probability Shuffle |
| example3 | Julia Power & Dist, Camera Cruise |
| example4 | Camera Sweep, Probability Shift |
| example5 | Julia Power Journey, Camera & Vibrancy, Probability Flow |
| example6 | Camera Cruise, Vibrancy Pulse, Probability Shift |

All animations are 90 frames at 30fps (3 seconds) with looping enabled by default.
