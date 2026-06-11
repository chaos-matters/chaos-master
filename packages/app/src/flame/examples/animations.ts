import { examples } from './index'
import type { FlameDescriptor } from '@/flame/schema/flameSchema'
import type { TimelineTrack } from '@/utils/timeline'

export interface AnimationDef {
  id: string
  name: string
  description: string
  exampleId: keyof typeof examples
  tracks: TimelineTrack[]
}

/** Resolve the flame descriptor for an animation */
export function getAnimationFlame(anim: AnimationDef): FlameDescriptor {
  return examples[anim.exampleId]
}

// ---------------------------------------------------------------------------
// Path builder — derives parameter paths from flame descriptor structure.
// Transforms and variations are sorted alphabetically (same convention as
// buildReadableIds) so indices map directly to T1/T2/... and V1/V2/... labels.
// No UUIDs are ever hardcoded — paths are always correct by construction.
// ---------------------------------------------------------------------------

interface AnimationPaths {
  transformProbability(transformIndex: number): string
  transformPreAffine(transformIndex: number, coef: string): string
  transformPostAffine(transformIndex: number, coef: string): string
  transformColor(transformIndex: number, channel: 'x' | 'y'): string
  variationParam(
    transformIndex: number,
    variationIndex: number,
    paramName: string,
  ): string
  variationWeight(transformIndex: number, variationIndex: number): string
  finalTransformParam(coef: string): string
}

function createAnimationPaths(flame: FlameDescriptor): AnimationPaths {
  const tids = Object.keys(flame.transforms).sort()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transforms = flame.transforms as Record<string, any>

  function getVids(tIndex: number): string[] {
    const tid = tids[tIndex]!
    return Object.keys(transforms[tid]?.variations ?? {}).sort()
  }

  return {
    transformProbability(tIndex: number): string {
      return `transform.${tids[tIndex]!}.probability`
    },
    transformPreAffine(tIndex: number, coef: string): string {
      return `transform.${tids[tIndex]!}.preAffine.${coef}`
    },
    transformPostAffine(tIndex: number, coef: string): string {
      return `transform.${tids[tIndex]!}.postAffine.${coef}`
    },
    transformColor(tIndex: number, channel: 'x' | 'y'): string {
      return `transform.${tids[tIndex]!}.color.${channel}`
    },
    variationParam(tIndex: number, vIndex: number, paramName: string): string {
      const tid = tids[tIndex]!
      const vid = getVids(tIndex)[vIndex]!
      return `${tid}.${vid}.${paramName}`
    },
    variationWeight(tIndex: number, vIndex: number): string {
      const tid = tids[tIndex]!
      const vid = getVids(tIndex)[vIndex]!
      return `${tid}.${vid}`
    },
    finalTransformParam(coef: string): string {
      return `finalTransform.${coef}`
    },
  }
}

// Pre-build paths for each example
const p1 = createAnimationPaths(examples.example1)
const p2 = createAnimationPaths(examples.example2)
const p3 = createAnimationPaths(examples.example3)
const p4 = createAnimationPaths(examples.example4)
const p5 = createAnimationPaths(examples.example5)
const p6 = createAnimationPaths(examples.example6)
const p8 = createAnimationPaths(examples.example8)
const p9 = createAnimationPaths(examples.example9)
const p10 = createAnimationPaths(examples.example10)
const p11 = createAnimationPaths(examples.example11)
const p12 = createAnimationPaths(examples.example12)
const p13 = createAnimationPaths(examples.example13)
const p14 = createAnimationPaths(examples.example14)
const p15 = createAnimationPaths(examples.example15)
const p16 = createAnimationPaths(examples.example16)
const p17 = createAnimationPaths(examples.example17)
const p18 = createAnimationPaths(examples.example18)
const p19 = createAnimationPaths(examples.example19)
const p20 = createAnimationPaths(examples.example20)
const p21 = createAnimationPaths(examples.example21)
const p22 = createAnimationPaths(examples.example22)
const p23 = createAnimationPaths(examples.example23)
const p24 = createAnimationPaths(examples.example24)
const p25 = createAnimationPaths(examples.example25)
const p26 = createAnimationPaths(examples.example26)
const p27 = createAnimationPaths(examples.example27)
const p28 = createAnimationPaths(examples.example28)
const p29 = createAnimationPaths(examples.example29)

// ---------------------------------------------------------------------------
// Example 1 — multi-transform with swirl, popcorn, pie, gaussian, sinusoidal
// Transform ordering (sorted): T0=linear, T1=swirl+popcorn+linear, T2=pie+gaussian, T3=sinusoidal
//   T1 V0=swirl, T1 V1=popcorn, T1 V2=linear
//   T2 V0=pie, T2 V1=gaussian
// ---------------------------------------------------------------------------

const ex1 = 'example1' as const

const anim1a: AnimationDef = {
  id: 'ex1-camera-pan',
  name: 'Camera Pan & Exposure',
  description: 'Slow camera pan across the fractal with exposure breathing',
  exampleId: ex1,
  tracks: [
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: -0.2, easing: 'easeInOut' as const },
        { frame: 60, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 40, value: 1.5, easing: 'easeInOut' as const },
        { frame: 80, value: 0.6, easing: 'easeIn' as const },
        { frame: 90, value: 1, easing: 'easeOut' as const },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.45, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

const anim1b: AnimationDef = {
  id: 'ex1-probability-dance',
  name: 'Probability Dance',
  description: 'Transform probabilities shift creating evolving structure',
  exampleId: ex1,
  tracks: [
    {
      parameterPath: p1.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 30, value: 0.1 },
        { frame: 60, value: 0.7 },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: p1.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 30, value: 0.7 },
        { frame: 60, value: 0.1 },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: p1.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 45, value: 0.05 },
        { frame: 90, value: 0.2 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 30, value: 10 },
        { frame: 60, value: 30 },
        { frame: 90, value: 20 },
      ],
    },
  ],
}

const anim1c: AnimationDef = {
  id: 'ex1-pie-params',
  name: 'Pie Slices & Swirl',
  description: 'Pie variation slices/thickness morph + swirl weight pulse',
  exampleId: ex1,
  tracks: [
    {
      parameterPath: p1.variationParam(2, 0, 'slices'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 30, value: 3 },
        { frame: 60, value: 8 },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p1.variationParam(2, 0, 'thickness'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p1.variationParam(2, 0, 'rotation'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: Math.PI * 2, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: p1.variationWeight(1, 0),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 2 — juliaScope with power/dist params
// Transform ordering (sorted): T0=juliaScope, T1=juliaScope (each single variation)
// ---------------------------------------------------------------------------

const ex2 = 'example2' as const

const anim2a: AnimationDef = {
  id: 'ex2-julia-power-wave',
  name: 'Julia Power Wave',
  description: 'Both juliaScope variations morph power and distance in sync',
  exampleId: ex2,
  tracks: [
    {
      parameterPath: p2.variationParam(0, 0, 'power'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 30, value: 2 },
        { frame: 60, value: 6 },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p2.variationParam(0, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 3.65 },
        { frame: 45, value: 1.5, easing: 'easeInOut' as const },
        { frame: 90, value: 3.65 },
      ],
    },
    {
      parameterPath: p2.variationParam(1, 0, 'power'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 45, value: 2 },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p2.variationParam(1, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 2.35 },
        { frame: 30, value: 5, easing: 'easeInOut' as const },
        { frame: 60, value: 1.5, easing: 'easeInOut' as const },
        { frame: 90, value: 2.35 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.35, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

const anim2b: AnimationDef = {
  id: 'ex2-camera-cruise',
  name: 'Camera Cruise',
  description: 'Smooth camera pan and zoom through the juliaScope fractal',
  exampleId: ex2,
  tracks: [
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 40, value: -0.3, easing: 'easeInOut' as const },
        { frame: 80, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.25, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.6, easing: 'easeIn' as const },
        { frame: 60, value: 1.8, easing: 'easeOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.85, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

const anim2c: AnimationDef = {
  id: 'ex2-probability-shuffle',
  name: 'Probability Shuffle',
  description: 'Transform probabilities trade dominance + skip iters ramps',
  exampleId: ex2,
  tracks: [
    {
      parameterPath: p2.transformProbability(0),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 45, value: 0.2 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p2.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.689 },
        { frame: 45, value: 0.95 },
        { frame: 90, value: 0.689 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 30, value: 5 },
        { frame: 60, value: 40 },
        { frame: 90, value: 20 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 3 — juliaN, eyefish, linear
// Transform ordering (sorted): T0=eyefish (V0=eyefish), T1=juliaN (V0=juliaN), T2=linear
// ---------------------------------------------------------------------------

const ex3 = 'example3' as const

const anim3a: AnimationDef = {
  id: 'ex3-julia-power',
  name: 'Julia Power & Dist',
  description: 'JuliaN power and distance evolve creating structural shifts',
  exampleId: ex3,
  tracks: [
    {
      parameterPath: p3.variationParam(1, 0, 'power'),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 3 },
        { frame: 60, value: 5 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p3.variationParam(1, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 2 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.45, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

const anim3b: AnimationDef = {
  id: 'ex3-camera-cruise',
  name: 'Camera Cruise',
  description: 'Camera pan with zoom breathing across the juliaN fractal',
  exampleId: ex3,
  tracks: [
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: -0.2, easing: 'easeInOut' as const },
        { frame: 60, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 35, value: 1.8, easing: 'easeInOut' as const },
        { frame: 70, value: 0.5, easing: 'easeIn' as const },
        { frame: 90, value: 1, easing: 'easeOut' as const },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 45, value: 35 },
        { frame: 90, value: 20 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 4 — three linear transforms, clean structure
// Transform ordering (sorted): T0,T1,T2 all linear (single variation each)
// ---------------------------------------------------------------------------

const ex4 = 'example4' as const

const anim4a: AnimationDef = {
  id: 'ex4-camera-sweep',
  name: 'Camera Sweep',
  description: 'Sweeping camera pan with dramatic zoom and exposure pulse',
  exampleId: ex4,
  tracks: [
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.5 },
        { frame: 60, value: -0.3 },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.4, easing: 'easeIn' as const },
        { frame: 60, value: 2, easing: 'easeOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

const anim4b: AnimationDef = {
  id: 'ex4-probability-shift',
  name: 'Probability Shift',
  description: 'Transform dominance shifts across the three transforms',
  exampleId: ex4,
  tracks: [
    {
      parameterPath: p4.transformProbability(2),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.2 },
        { frame: 60, value: 0.6 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p4.transformProbability(0),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.8 },
        { frame: 60, value: 0.2 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p4.transformProbability(1),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 45, value: 0.1 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.95, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 45, value: 5 },
        { frame: 90, value: 20 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 5 — linear transforms + juliaN with high power
// Transform ordering (sorted): T0=linear, T1=linear, T2=juliaN (V0=juliaN), T3=linear
// ---------------------------------------------------------------------------

const ex5 = 'example5' as const

const anim5a: AnimationDef = {
  id: 'ex5-julia-power-journey',
  name: 'Julia Power Journey',
  description: 'High-power juliaN morphs through power and distance values',
  exampleId: ex5,
  tracks: [
    {
      parameterPath: p5.variationParam(2, 0, 'power'),
      keyframes: [
        { frame: 0, value: 8 },
        { frame: 30, value: 3 },
        { frame: 60, value: 12 },
        { frame: 90, value: 8 },
      ],
    },
    {
      parameterPath: p5.variationParam(2, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 6.82 },
        { frame: 45, value: 2, easing: 'easeInOut' as const },
        { frame: 90, value: 6.82 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 45, value: 1.6, easing: 'easeInOut' as const },
        { frame: 90, value: 1 },
      ],
    },
  ],
}

const anim5b: AnimationDef = {
  id: 'ex5-camera-vibrancy',
  name: 'Camera & Vibrancy',
  description: 'Smooth camera movement with vibrancy color pulse',
  exampleId: ex5,
  tracks: [
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 40, value: -0.3, easing: 'easeInOut' as const },
        { frame: 80, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.2, easing: 'easeInOut' as const },
        { frame: 60, value: 1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 45, value: 30 },
        { frame: 90, value: 20 },
      ],
    },
  ],
}

const anim5c: AnimationDef = {
  id: 'ex5-probability-flow',
  name: 'Probability Flow',
  description: 'Four transforms trade probability dominance in waves',
  exampleId: ex5,
  tracks: [
    {
      parameterPath: p5.transformProbability(1),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.1 },
        { frame: 60, value: 0.7 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p5.transformProbability(0),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 45, value: 0.2 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p5.transformProbability(3),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.5 },
        { frame: 60, value: 0.05 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p5.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.956 },
        { frame: 45, value: 0.3 },
        { frame: 90, value: 0.956 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 6 — same transforms as example 4 but paint draw mode
// ---------------------------------------------------------------------------

const ex6 = 'example6' as const

const anim6a: AnimationDef = {
  id: 'ex6-camera-cruise',
  name: 'Camera Cruise',
  description: 'Smooth camera pan and zoom through the paint-mode fractal',
  exampleId: ex6,
  tracks: [
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.4, easing: 'easeInOut' as const },
        { frame: 60, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.35, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 35, value: 0.5, easing: 'easeIn' as const },
        { frame: 70, value: 1.8, easing: 'easeOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

const anim6b: AnimationDef = {
  id: 'ex6-vibrancy-pulse',
  name: 'Vibrancy Pulse',
  description: 'Vibrancy rises and falls like a heartbeat with exposure sync',
  exampleId: ex6,
  tracks: [
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 15, value: 0.95, easing: 'easeOut' as const },
        { frame: 30, value: 0.2, easing: 'easeIn' as const },
        { frame: 45, value: 0.95, easing: 'easeOut' as const },
        { frame: 60, value: 0.2, easing: 'easeIn' as const },
        { frame: 75, value: 0.95, easing: 'easeOut' as const },
        { frame: 90, value: 0.5, easing: 'easeIn' as const },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 30, value: 0.55, easing: 'easeInOut' as const },
        { frame: 60, value: 0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 45, value: 8 },
        { frame: 90, value: 20 },
      ],
    },
  ],
}

const anim6c: AnimationDef = {
  id: 'ex6-probability-shift',
  name: 'Probability Shift',
  description: 'Three transforms swap probability dominance cyclically',
  exampleId: ex6,
  tracks: [
    {
      parameterPath: p6.transformProbability(2),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.05 },
        { frame: 60, value: 0.7 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p6.transformProbability(0),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.8 },
        { frame: 60, value: 0.1 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p6.transformProbability(1),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 45, value: 0.2 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.8, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Advanced Example 1 — Affine morph + swirl weight + pie params
// ---------------------------------------------------------------------------

const anim1d: AnimationDef = {
  id: 'ex1-affine-morph',
  name: 'Affine Morph',
  description: 'Pre/post affine coefficients morph shape structure',
  exampleId: ex1,
  tracks: [
    {
      parameterPath: p1.transformPreAffine(2, 'a'),
      keyframes: [
        { frame: 0, value: 0.6 },
        { frame: 45, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.6 },
      ],
    },
    {
      parameterPath: p1.transformPreAffine(2, 'b'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: -0.3, easing: 'easeInOut' as const },
        { frame: 60, value: 1.0, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p1.transformPreAffine(2, 'c'),
      keyframes: [
        { frame: 0, value: -0.5 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: -0.5 },
      ],
    },
    {
      parameterPath: p1.transformPreAffine(2, 'e'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 1.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p1.transformPreAffine(2, 'f'),
      keyframes: [
        { frame: 0, value: -0.5 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: -1.0, easing: 'easeInOut' as const },
        { frame: 90, value: -0.5 },
      ],
    },
    {
      parameterPath: p1.variationParam(2, 0, 'slices'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 45, value: 12 },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p1.variationWeight(1, 0),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 1.5 },
        { frame: 60, value: 0.1 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.95, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Advanced Example 2 — Double juliaScope full-spectrum
// ---------------------------------------------------------------------------

const anim2d: AnimationDef = {
  id: 'ex2-juliaScope-full',
  name: 'JuliaScope Full Spectrum',
  description:
    'Both juliaScope variations morph power/dist + camera zoom + vibrancy',
  exampleId: ex2,
  tracks: [
    {
      parameterPath: p2.variationParam(0, 0, 'power'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 20, value: 1, easing: 'easeOut' as const },
        { frame: 40, value: 8, easing: 'easeIn' as const },
        { frame: 60, value: 2 },
        { frame: 80, value: 6 },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p2.variationParam(0, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 3.65 },
        { frame: 30, value: 0.5, easing: 'easeInOut' as const },
        { frame: 60, value: 8, easing: 'easeInOut' as const },
        { frame: 90, value: 3.65 },
      ],
    },
    {
      parameterPath: p2.variationParam(1, 0, 'power'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 20, value: 7 },
        { frame: 40, value: 1, easing: 'easeIn' as const },
        { frame: 60, value: 10 },
        { frame: 80, value: 3, easing: 'easeOut' as const },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p2.variationParam(1, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 2.35 },
        { frame: 30, value: 0.75, easing: 'easeInOut' as const },
        { frame: 60, value: 6, easing: 'easeInOut' as const },
        { frame: 90, value: 2.35 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.4, easing: 'easeIn' as const },
        { frame: 60, value: 2.5, easing: 'easeOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'camera.rotation',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: Math.PI * 0.75, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.95, easing: 'easeOut' as const },
        { frame: 60, value: 0.1 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.55, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Advanced Example 3 — Pie full morph + gaussian weight + exposure pulse
// ---------------------------------------------------------------------------

const anim1e: AnimationDef = {
  id: 'ex1-pie-full-morph',
  name: 'Pie Full Morph',
  description:
    'Pie slices/thickness/rotation with gaussian weight and exposure pulse',
  exampleId: ex1,
  tracks: [
    {
      parameterPath: p1.variationParam(2, 0, 'slices'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 20, value: 2 },
        { frame: 40, value: 10 },
        { frame: 60, value: 3 },
        { frame: 80, value: 15 },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p1.variationParam(2, 0, 'thickness'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 25, value: 0.1, easing: 'easeIn' as const },
        { frame: 50, value: 0.9, easing: 'easeOut' as const },
        { frame: 75, value: 0.2, easing: 'easeIn' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p1.variationParam(2, 0, 'rotation'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: Math.PI * 4, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: p1.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 30, value: 0.6 },
        { frame: 60, value: 0.05 },
        { frame: 90, value: 0.2 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 22, value: 0.6, easing: 'easeOut' as const },
        { frame: 45, value: 0.1, easing: 'easeIn' as const },
        { frame: 68, value: 0.55, easing: 'easeOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.5, easing: 'easeIn' as const },
        { frame: 60, value: 1.8, easing: 'easeOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 1, easing: 'linear' as const },
        { frame: 90, value: 0 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Advanced Example 4 — Example 5 mega morph (juliaN + probability wave)
// ---------------------------------------------------------------------------

const anim5d: AnimationDef = {
  id: 'ex5-mega-morph',
  name: 'Mega Morph',
  description:
    'JuliaN power/dist sweep with probability waves across all four transforms',
  exampleId: ex5,
  tracks: [
    {
      parameterPath: p5.variationParam(2, 0, 'power'),
      keyframes: [
        { frame: 0, value: 8 },
        { frame: 20, value: 2 },
        { frame: 40, value: 15 },
        { frame: 60, value: 4 },
        { frame: 80, value: 12 },
        { frame: 90, value: 8 },
      ],
    },
    {
      parameterPath: p5.variationParam(2, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 6.82 },
        { frame: 30, value: 1, easing: 'easeIn' as const },
        { frame: 60, value: 12, easing: 'easeOut' as const },
        { frame: 90, value: 6.82 },
      ],
    },
    {
      parameterPath: p5.transformProbability(1),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 20, value: 0.05 },
        { frame: 40, value: 0.5 },
        { frame: 60, value: 0.8 },
        { frame: 80, value: 0.2 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p5.transformProbability(0),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 25, value: 0.7 },
        { frame: 50, value: 0.1 },
        { frame: 75, value: 0.6 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p5.transformProbability(3),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.3 },
        { frame: 60, value: 0.05 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p5.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.956 },
        { frame: 30, value: 0.5 },
        { frame: 60, value: 0.1 },
        { frame: 90, value: 0.956 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.35, easing: 'easeIn' as const },
        { frame: 60, value: 2.2, easing: 'easeOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 1, easing: 'easeOut' as const },
        { frame: 60, value: 0.1, easing: 'easeIn' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 30, value: 0.6, easing: 'easeInOut' as const },
        { frame: 60, value: 0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Advanced Example 5 — Example 3 multi-morph
// ---------------------------------------------------------------------------

const anim3c: AnimationDef = {
  id: 'ex3-multi-morph',
  name: 'Multi Morph',
  description: 'JuliaN power/dist + eyefish weight + camera cruise',
  exampleId: ex3,
  tracks: [
    {
      parameterPath: p3.variationParam(1, 0, 'power'),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 20, value: 5 },
        { frame: 40, value: 2 },
        { frame: 60, value: 8 },
        { frame: 80, value: 3 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p3.variationParam(1, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: 5, easing: 'easeInOut' as const },
        { frame: 90, value: 2 },
      ],
    },
    {
      parameterPath: p3.variationWeight(0, 0),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.2 },
        { frame: 60, value: 2.5 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.5 },
        { frame: 60, value: -0.3 },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.3, easing: 'easeIn' as const },
        { frame: 60, value: 2, easing: 'easeOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 8, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 8 — Tidal Spiral: swirl3Var core + horseshoe/spherical + juliaScope
// Transform ordering (sorted):
//   T0=swirl3Var+linear, T1=juliaScope, T2=horseshoe+spherical+linear
// ---------------------------------------------------------------------------

const ex8 = 'example8' as const

const anim8a: AnimationDef = {
  id: 'ex8-swirl-shift-camera',
  name: 'Swirl Shift & Camera',
  description: 'Swirl3Var shift morphs the vortex while camera pans across it',
  exampleId: ex8,
  tracks: [
    {
      parameterPath: p8.variationParam(0, 0, 'shift'),
      keyframes: [
        { frame: 0, value: 7.5 },
        { frame: 30, value: 3, easing: 'easeInOut' as const },
        { frame: 60, value: 15, easing: 'easeInOut' as const },
        { frame: 90, value: 7.5 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0.05 },
        { frame: 45, value: 0.35, easing: 'easeInOut' as const },
        { frame: 90, value: 0.05 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: -0.05 },
        { frame: 30, value: 0.25, easing: 'easeInOut' as const },
        { frame: 60, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: -0.05 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 40, value: 0.6, easing: 'easeIn' as const },
        { frame: 80, value: 1.8, easing: 'easeOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
  ],
}

const anim8b: AnimationDef = {
  id: 'ex8-probability-tide',
  name: 'Probability Tide',
  description:
    'Transform probabilities ebb and flow like tides + palette cycle',
  exampleId: ex8,
  tracks: [
    {
      parameterPath: p8.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.8 },
        { frame: 30, value: 0.2 },
        { frame: 60, value: 0.95 },
        { frame: 90, value: 0.8 },
      ],
    },
    {
      parameterPath: p8.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 30, value: 0.6 },
        { frame: 60, value: 0.05 },
        { frame: 90, value: 0.2 },
      ],
    },
    {
      parameterPath: p8.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.45 },
        { frame: 45, value: 0.1 },
        { frame: 90, value: 0.45 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.15, easing: 'easeInOut' as const },
        { frame: 60, value: 0.95, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 45, value: 40 },
        { frame: 90, value: 20 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 9 — Crystal Genesis: grid lattice + fan2/popcorn + juliaN/eyefish
// Transform ordering (sorted):
//   T0=grid+linear, T1=fan2+popcorn+linear, T2=juliaN+eyefish
// ---------------------------------------------------------------------------

const ex9 = 'example9' as const

const anim9a: AnimationDef = {
  id: 'ex9-grid-morph',
  name: 'Grid Morph & Camera',
  description:
    'Grid divisions morph the lattice while fan2 shifts and camera cruises',
  exampleId: ex9,
  tracks: [
    {
      parameterPath: p9.variationParam(0, 0, 'divisions'),
      keyframes: [
        { frame: 0, value: 8 },
        { frame: 30, value: 3 },
        { frame: 60, value: 15 },
        { frame: 90, value: 8 },
      ],
    },
    {
      parameterPath: p9.variationParam(0, 0, 'jitterNearIntersectionsDistance'),
      keyframes: [
        { frame: 0, value: 0.003 },
        { frame: 45, value: 0.02, easing: 'easeInOut' as const },
        { frame: 90, value: 0.003 },
      ],
    },
    {
      parameterPath: p9.variationParam(1, 0, 'x'),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 45, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: p9.variationParam(1, 0, 'y'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.9 },
        { frame: 60, value: 0.2 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.4 },
        { frame: 35, value: 0.8, easing: 'easeIn' as const },
        { frame: 70, value: 2.2, easing: 'easeOut' as const },
        { frame: 90, value: 1.4 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
  ],
}

const anim9b: AnimationDef = {
  id: 'ex9-julia-crystallize',
  name: 'Julia Power Crystallize',
  description: 'JuliaN power and distance sweep transforms the crystal core',
  exampleId: ex9,
  tracks: [
    {
      parameterPath: p9.variationParam(2, 0, 'power'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 30, value: 2 },
        { frame: 60, value: 8 },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p9.variationParam(2, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 45, value: 1, easing: 'easeIn' as const },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p9.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.15 },
        { frame: 30, value: 0.5 },
        { frame: 60, value: 0.05 },
        { frame: 90, value: 0.15 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 30, value: 0.5, easing: 'easeOut' as const },
        { frame: 60, value: 0.1, easing: 'easeIn' as const },
        { frame: 90, value: 0.25 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 1, easing: 'linear' as const },
        { frame: 90, value: 0 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 10 — Solar Prominence: spirograph + gaussian/spherical/swirl + juliaScope/sinusoidal
// Transform ordering (sorted):
//   T0=spirographVar+linear, T1=gaussian+spherical+swirl, T2=juliaScope+sinusoidal
// ---------------------------------------------------------------------------

const ex10 = 'example10' as const

const anim10a: AnimationDef = {
  id: 'ex10-spirograph-flare',
  name: 'Spirograph Flare',
  description: 'Spirograph epicycloid params morph creating dynamic solar arcs',
  exampleId: ex10,
  tracks: [
    {
      parameterPath: p10.variationParam(0, 0, 'a'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 30, value: 1.5 },
        { frame: 60, value: 5 },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p10.variationParam(0, 0, 'b'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 45, value: 1 },
        { frame: 90, value: 2 },
      ],
    },
    {
      parameterPath: p10.variationParam(0, 0, 'c1'),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 2.5 },
        { frame: 60, value: -0.5 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p10.variationParam(0, 0, 'c2'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.4, easing: 'easeInOut' as const },
        { frame: 60, value: -0.25, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0.05 },
        { frame: 45, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0.05 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 45, value: 0.55, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
  ],
}

const anim10b: AnimationDef = {
  id: 'ex10-fractal-eruption',
  name: 'Fractal Eruption',
  description: 'JuliaScope erupts with power shifts while probabilities surge',
  exampleId: ex10,
  tracks: [
    {
      parameterPath: p10.variationParam(2, 0, 'power'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 25, value: 1.5 },
        { frame: 50, value: 8 },
        { frame: 75, value: 2 },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p10.variationParam(2, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 2.5 },
        { frame: 30, value: 0.5, easing: 'easeIn' as const },
        { frame: 60, value: 6, easing: 'easeOut' as const },
        { frame: 90, value: 2.5 },
      ],
    },
    {
      parameterPath: p10.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 30, value: 0.6 },
        { frame: 60, value: 0.05 },
        { frame: 90, value: 0.2 },
      ],
    },
    {
      parameterPath: p10.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 45, value: 0.2 },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.4, easing: 'easeIn' as const },
        { frame: 60, value: 2, easing: 'easeOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 1, easing: 'easeOut' as const },
        { frame: 60, value: 0.1, easing: 'easeIn' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 11 — Void Weave: diamond+spiral, juliaN+horseshoe, bent+juliaScope
// Transform ordering (sorted):
//   T0=diamond+spiral+linear, T1=juliaN+horseshoe+linear, T2=bent+juliaScope+linear
// ---------------------------------------------------------------------------

const ex11 = 'example11' as const

const anim11a: AnimationDef = {
  id: 'ex11-web-tightening',
  name: 'Web Tightening',
  description: 'JuliaN power ramps tightening the weave + camera dive',
  exampleId: ex11,
  tracks: [
    {
      parameterPath: p11.variationParam(1, 0, 'power'),
      keyframes: [
        { frame: 0, value: 6 },
        { frame: 30, value: 2 },
        { frame: 60, value: 10 },
        { frame: 90, value: 6 },
      ],
    },
    {
      parameterPath: p11.variationParam(1, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 2 },
      ],
    },
    {
      parameterPath: p11.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.6 },
        { frame: 30, value: 0.9 },
        { frame: 60, value: 0.2 },
        { frame: 90, value: 0.6 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.3 },
        { frame: 30, value: 0.5, easing: 'easeIn' as const },
        { frame: 60, value: 2.5, easing: 'easeOut' as const },
        { frame: 90, value: 1.3 },
      ],
    },
    {
      parameterPath: 'camera.rotation',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: Math.PI * 0.5, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 45, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.2 },
      ],
    },
  ],
}

const anim11b: AnimationDef = {
  id: 'ex11-dark-pulse',
  name: 'Dark Pulse',
  description:
    'Exposure and vibrancy pulse like a heartbeat while palette cycles',
  exampleId: ex11,
  tracks: [
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 15, value: 0.55, easing: 'easeOut' as const },
        { frame: 30, value: 0.05, easing: 'easeIn' as const },
        { frame: 45, value: 0.5, easing: 'easeOut' as const },
        { frame: 60, value: 0.08, easing: 'easeIn' as const },
        { frame: 75, value: 0.45, easing: 'easeOut' as const },
        { frame: 90, value: 0.2 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.05, easing: 'easeInOut' as const },
        { frame: 60, value: 1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 8, easing: 'easeInOut' as const },
        { frame: 60, value: 0.1 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: 2, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 30, value: 5 },
        { frame: 60, value: 45 },
        { frame: 90, value: 20 },
      ],
    },
    {
      parameterPath: p11.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 45, value: 0.7 },
        { frame: 90, value: 0.3 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 12 — Prism Cascade: polar+cosine, fan2+spherical, juliaScope+eyefish
// Transform ordering (sorted):
//   T0=polar+cosine+linear, T1=fan2+spherical+linear, T2=juliaScope+eyefish
// ---------------------------------------------------------------------------

const ex12 = 'example12' as const

const anim12a: AnimationDef = {
  id: 'ex12-kaleidoscope',
  name: 'Kaleidoscope Shift',
  description:
    'Fan2 params and probability create shifting kaleidoscopic patterns',
  exampleId: ex12,
  tracks: [
    {
      parameterPath: p12.variationParam(1, 0, 'x'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 25, value: 0.9 },
        { frame: 50, value: 0.1 },
        { frame: 75, value: 0.7 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p12.variationParam(1, 0, 'y'),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 30, value: 0.2 },
        { frame: 60, value: 0.95 },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: p12.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.65 },
        { frame: 30, value: 0.2 },
        { frame: 60, value: 0.9 },
        { frame: 90, value: 0.65 },
      ],
    },
    {
      parameterPath: p12.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 45, value: 0.8 },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.35, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.1 },
        { frame: 30, value: 0.5, easing: 'easeIn' as const },
        { frame: 60, value: 2, easing: 'easeOut' as const },
        { frame: 90, value: 1.1 },
      ],
    },
  ],
}

const anim12b: AnimationDef = {
  id: 'ex12-color-refraction',
  name: 'Color Refraction',
  description:
    'Vibrancy, palette, and juliaScope params create prismatic color shifts',
  exampleId: ex12,
  tracks: [
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 20, value: 1, easing: 'easeOut' as const },
        { frame: 40, value: 0, easing: 'easeIn' as const },
        { frame: 60, value: 0.95, easing: 'easeOut' as const },
        { frame: 80, value: 0.1, easing: 'easeIn' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 1.5, easing: 'linear' as const },
        { frame: 60, value: 0.5, easing: 'linear' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 6, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p12.variationParam(2, 0, 'power'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 30, value: 2 },
        { frame: 60, value: 7 },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p12.variationParam(2, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 2 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.28 },
        { frame: 30, value: 0.55, easing: 'easeInOut' as const },
        { frame: 60, value: 0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.28 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 13 — Nebula Ghost: cliffordVar+curl, pdjVar+sinusoidal, gaussian+linear
// Transform ordering (sorted):
//   T0=cliffordVar+curlVar, T1=gaussian+linear, T2=pdjVar+sinusoidal
//   T0 V0=cliffordVar, T0 V1=curlVar
//   T2 V0=pdjVar, T2 V1=sinusoidal
// ---------------------------------------------------------------------------

const ex13 = 'example13' as const

const anim13a: AnimationDef = {
  id: 'ex13-clifford-morph',
  name: 'Clifford Morph & Camera',
  description:
    'Clifford attractor params morph while camera sweeps through the nebula',
  exampleId: ex13,
  tracks: [
    {
      parameterPath: p13.variationParam(0, 0, 'a'),
      keyframes: [
        { frame: 0, value: -1.4 },
        { frame: 30, value: -1.8 },
        { frame: 60, value: -1.0 },
        { frame: 90, value: -1.4 },
      ],
    },
    {
      parameterPath: p13.variationParam(0, 0, 'b'),
      keyframes: [
        { frame: 0, value: 1.6 },
        { frame: 25, value: 1.0 },
        { frame: 50, value: 2.0 },
        { frame: 75, value: 1.3 },
        { frame: 90, value: 1.6 },
      ],
    },
    {
      parameterPath: p13.variationParam(0, 0, 'c'),
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 45, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: p13.variationParam(0, 0, 'd'),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 30, value: 1.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: -0.35, easing: 'easeInOut' as const },
        { frame: 60, value: 0.35, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.25, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 35, value: 0.7, easing: 'easeIn' as const },
        { frame: 70, value: 1.8, easing: 'easeOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.32 },
        { frame: 45, value: 0.55, easing: 'easeInOut' as const },
        { frame: 90, value: 0.32 },
      ],
    },
  ],
}

const anim13b: AnimationDef = {
  id: 'ex13-pdj-ghost',
  name: 'PDJ Ghost Dance',
  description: 'PDJ params shift creating ghostly parametric wave distortions',
  exampleId: ex13,
  tracks: [
    {
      parameterPath: p13.variationParam(2, 0, 'a'),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 25, value: 3 },
        { frame: 50, value: 0.5 },
        { frame: 75, value: 2 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p13.variationParam(2, 0, 'b'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 30, value: 1 },
        { frame: 60, value: 4 },
        { frame: 90, value: 2 },
      ],
    },
    {
      parameterPath: p13.variationParam(2, 0, 'c'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 45, value: 1, easing: 'easeInOut' as const },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p13.variationParam(2, 0, 'd'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 30, value: 6, easing: 'easeInOut' as const },
        { frame: 60, value: 1.5, easing: 'easeInOut' as const },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p13.variationWeight(2, 1),
      keyframes: [
        { frame: 0, value: 0.35 },
        { frame: 30, value: 1.2 },
        { frame: 60, value: 0.1 },
        { frame: 90, value: 0.35 },
      ],
    },
    {
      parameterPath: p13.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 30, value: 0.7 },
        { frame: 60, value: 0.15 },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.95, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 6, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

const anim13c: AnimationDef = {
  id: 'ex13-affine-curl-drift',
  name: 'Affine & Curl Drift',
  description: 'Pre-affine coefficients drift while curl param breathes',
  exampleId: ex13,
  tracks: [
    {
      parameterPath: p13.transformPreAffine(0, 'a'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.2, easing: 'easeInOut' as const },
        { frame: 60, value: 0.8, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p13.transformPreAffine(0, 'b'),
      keyframes: [
        { frame: 0, value: -0.05 },
        { frame: 45, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: -0.05 },
      ],
    },
    {
      parameterPath: p13.transformPreAffine(0, 'c'),
      keyframes: [
        { frame: 0, value: 0.02 },
        { frame: 30, value: 0.15, easing: 'easeInOut' as const },
        { frame: 60, value: -0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.02 },
      ],
    },
    {
      parameterPath: p13.transformPreAffine(0, 'e'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p13.variationParam(0, 1, 'c1'),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.2, easing: 'easeInOut' as const },
        { frame: 60, value: 2, easing: 'easeInOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p13.variationParam(0, 1, 'c2'),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 45, value: 2.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 45, value: 1.8, easing: 'easeInOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.32 },
        { frame: 30, value: 0.15, easing: 'easeInOut' as const },
        { frame: 60, value: 0.55, easing: 'easeInOut' as const },
        { frame: 90, value: 0.32 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 14 — Ripple Veil: rippleVar+sinusoidal, sinusGridVar+spherical, hexesVar+spiral
// Transform ordering (sorted):
//   T0=sinusGridVar+spherical, T1=rippleVar+sinusoidal, T2=hexesVar+spiral
// ---------------------------------------------------------------------------

const ex14 = 'example14' as const

const anim14a: AnimationDef = {
  id: 'ex14-ripple-surge',
  name: 'Ripple Surge & Grid',
  description: 'Ripple frequency and amplitude surge while grid waves shift',
  exampleId: ex14,
  tracks: [
    {
      parameterPath: p14.variationParam(1, 0, 'frequency'),
      keyframes: [
        { frame: 0, value: 2.0 },
        { frame: 25, value: 0.8 },
        { frame: 50, value: 4.0 },
        { frame: 75, value: 1.2 },
        { frame: 90, value: 2.0 },
      ],
    },
    {
      parameterPath: p14.variationParam(1, 0, 'amplitude'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 1.2, easing: 'easeInOut' as const },
        { frame: 60, value: 0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p14.variationParam(1, 0, 'velocity'),
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 45, value: 2.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: p14.variationParam(0, 0, 'freqx'),
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 30, value: 0.5 },
        { frame: 60, value: 2.0 },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: p14.variationParam(0, 0, 'freqy'),
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 45, value: 2.2 },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: p14.variationParam(0, 0, 'ampx'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 25, value: 1.0, easing: 'easeInOut' as const },
        { frame: 50, value: 0.15, easing: 'easeInOut' as const },
        { frame: 75, value: 0.8, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0.02 },
        { frame: 30, value: 0.4, easing: 'easeInOut' as const },
        { frame: 60, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0.02 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.1 },
        { frame: 40, value: 0.6, easing: 'easeIn' as const },
        { frame: 80, value: 1.8, easing: 'easeOut' as const },
        { frame: 90, value: 1.1 },
      ],
    },
  ],
}

const anim14b: AnimationDef = {
  id: 'ex14-hex-drift',
  name: 'Hex Drift & Phase',
  description:
    'Hexes lattice morphs while palette cycles through spectral phases',
  exampleId: ex14,
  tracks: [
    {
      parameterPath: p14.variationParam(2, 0, 'cellsize'),
      keyframes: [
        { frame: 0, value: 0.1 },
        { frame: 30, value: 0.05 },
        { frame: 60, value: 0.2 },
        { frame: 90, value: 0.1 },
      ],
    },
    {
      parameterPath: p14.variationParam(2, 0, 'power'),
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 45, value: 2.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: p14.variationParam(2, 0, 'rotate'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: Math.PI * 2, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: p14.variationParam(2, 0, 'scale'),
      keyframes: [
        { frame: 0, value: 0.75 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: 1.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.75 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 1.5, easing: 'linear' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.2 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.28 },
        { frame: 30, value: 0.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.28 },
      ],
    },
  ],
}

const anim14c: AnimationDef = {
  id: 'ex14-probability-ripple',
  name: 'Probability Ripple',
  description: 'Transform probabilities ebb and flow like waves',
  exampleId: ex14,
  tracks: [
    {
      parameterPath: p14.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.6 },
        { frame: 25, value: 0.15 },
        { frame: 50, value: 0.85 },
        { frame: 75, value: 0.3 },
        { frame: 90, value: 0.6 },
      ],
    },
    {
      parameterPath: p14.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.45 },
        { frame: 30, value: 0.8 },
        { frame: 60, value: 0.2 },
        { frame: 90, value: 0.45 },
      ],
    },
    {
      parameterPath: p14.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.6 },
        { frame: 90, value: 0.25 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.05, easing: 'easeInOut' as const },
        { frame: 60, value: 0.95, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 30, value: 8 },
        { frame: 60, value: 35 },
        { frame: 90, value: 20 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: -0.02 },
        { frame: 45, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: -0.02 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 15 — Pixel Storm: pixelFlowVar+swirl, linearTVar+gaussian, scry2Var+popcorn2Var
// Transform ordering (sorted):
//   T0=pixelFlowVar+swirl, T1=linearTVar+gaussian, T2=scry2Var+popcorn2Var
//   T2 V0=scry2Var, T2 V1=popcorn2Var (alphabetically sorted vids)
// ---------------------------------------------------------------------------

const ex15 = 'example15' as const

const anim15a: AnimationDef = {
  id: 'ex15-pixel-bleed',
  name: 'Pixel Bleed & Scry',
  description: 'PixelFlow angle/len bleed while scry2 polygon sides morph',
  exampleId: ex15,
  tracks: [
    {
      parameterPath: p15.variationParam(0, 0, 'angle'),
      keyframes: [
        { frame: 0, value: 90 },
        { frame: 30, value: 0 },
        { frame: 60, value: 180 },
        { frame: 90, value: 90 },
      ],
    },
    {
      parameterPath: p15.variationParam(0, 0, 'len'),
      keyframes: [
        { frame: 0, value: 0.1 },
        { frame: 25, value: 0.3 },
        { frame: 50, value: 0.05 },
        { frame: 75, value: 0.2 },
        { frame: 90, value: 0.1 },
      ],
    },
    {
      parameterPath: p15.variationParam(0, 0, 'width'),
      keyframes: [
        { frame: 0, value: 200 },
        { frame: 45, value: 100, easing: 'easeInOut' as const },
        { frame: 90, value: 200 },
      ],
    },
    {
      parameterPath: p15.variationParam(2, 0, 'sides'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 30, value: 3 },
        { frame: 60, value: 7 },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p15.variationParam(2, 0, 'star'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: p15.variationParam(2, 0, 'circle'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.8, easing: 'easeInOut' as const },
        { frame: 60, value: 0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.15 },
        { frame: 30, value: 0.5, easing: 'easeIn' as const },
        { frame: 60, value: 2, easing: 'easeOut' as const },
        { frame: 90, value: 1.15 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
  ],
}

const anim15b: AnimationDef = {
  id: 'ex15-linear-power',
  name: 'Linear Power Distortion',
  description: 'LinearTVar power params and popcorn2 burst morph',
  exampleId: ex15,
  tracks: [
    {
      parameterPath: p15.variationParam(1, 0, 'powX'),
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 25, value: 0.5 },
        { frame: 50, value: 2.5 },
        { frame: 75, value: 0.8 },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: p15.variationParam(1, 0, 'powY'),
      keyframes: [
        { frame: 0, value: 0.9 },
        { frame: 30, value: 2.0 },
        { frame: 60, value: 0.3 },
        { frame: 90, value: 0.9 },
      ],
    },
    {
      parameterPath: p15.variationParam(2, 1, 'x'),
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 45, value: 2.0, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: p15.variationParam(2, 1, 'y'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 1.5 },
        { frame: 60, value: 0.2 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p15.variationParam(2, 1, 'c'),
      keyframes: [
        { frame: 0, value: 1.5 },
        { frame: 45, value: 3.0, easing: 'easeInOut' as const },
        { frame: 90, value: 1.5 },
      ],
    },
    {
      parameterPath: p15.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.45 },
        { frame: 30, value: 0.7 },
        { frame: 60, value: 0.15 },
        { frame: 90, value: 0.45 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.15, easing: 'easeInOut' as const },
        { frame: 60, value: 0.95, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'camera.rotation',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: Math.PI * 0.6, easing: 'linear' as const },
      ],
    },
  ],
}

const anim15c: AnimationDef = {
  id: 'ex15-scry-full-morph',
  name: 'Scry Full Morph & Camera',
  description: 'Full scry2 morph with pixelFlow seed drift and camera sweep',
  exampleId: ex15,
  tracks: [
    {
      parameterPath: p15.variationParam(2, 0, 'circle'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 20, value: 1.0, easing: 'easeOut' as const },
        { frame: 50, value: 0, easing: 'easeIn' as const },
        { frame: 70, value: 0.6, easing: 'easeOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: p15.variationParam(2, 0, 'star'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 40, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: p15.variationParam(2, 0, 'sides'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 30, value: 6 },
        { frame: 60, value: 3 },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p15.variationParam(0, 0, 'seed'),
      keyframes: [
        { frame: 0, value: 42 },
        { frame: 30, value: 100 },
        { frame: 60, value: 0 },
        { frame: 90, value: 42 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.4, easing: 'easeInOut' as const },
        { frame: 60, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.35, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 7, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 45, value: 40 },
        { frame: 90, value: 20 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 16 — Phantom Lattice: blob+hexesVar, juliaScope+eyefish, ngonVar+spherical+horseshoe
// Transform ordering (sorted):
//   T0=blob+hexesVar, T1=juliaScope+eyefish, T2=horseshoe+ngonVar+spherical
//   T0 V0=blob, T0 V1=hexesVar
//   T2 V0=horseshoe, T2 V1=ngonVar, T2 V2=spherical (sorted vids)
// ---------------------------------------------------------------------------

const ex16 = 'example16' as const

const anim16a: AnimationDef = {
  id: 'ex16-blob-waves',
  name: 'Blob Waves & Lattice',
  description: 'Blob wave params undulate while hex lattice rotates and scales',
  exampleId: ex16,
  tracks: [
    {
      parameterPath: p16.variationParam(0, 0, 'high'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 25, value: 1.2 },
        { frame: 50, value: 3.5 },
        { frame: 75, value: 1.8 },
        { frame: 90, value: 2 },
      ],
    },
    {
      parameterPath: p16.variationParam(0, 0, 'low'),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: 2, easing: 'easeInOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p16.variationParam(0, 0, 'waves'),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 45, value: 3 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p16.variationParam(0, 1, 'rotate'),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 90, value: Math.PI * 2 + 0.3, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: p16.variationParam(0, 1, 'scale'),
      keyframes: [
        { frame: 0, value: 0.65 },
        { frame: 30, value: 1.0, easing: 'easeInOut' as const },
        { frame: 60, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0.65 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.35, easing: 'easeInOut' as const },
        { frame: 60, value: -0.25, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.05 },
        { frame: 40, value: 0.5, easing: 'easeIn' as const },
        { frame: 80, value: 1.7, easing: 'easeOut' as const },
        { frame: 90, value: 1.05 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.45, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

const anim16b: AnimationDef = {
  id: 'ex16-ngon-crystallize',
  name: 'N-Gon Crystallize',
  description:
    'N-gon polygon params crystallize while juliaScope fractal deepens',
  exampleId: ex16,
  tracks: [
    {
      parameterPath: p16.variationParam(2, 1, 'power'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 25, value: 4 },
        { frame: 50, value: 1 },
        { frame: 75, value: 5 },
        { frame: 90, value: 2 },
      ],
    },
    {
      parameterPath: p16.variationParam(2, 1, 'sides'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 30, value: 6 },
        { frame: 60, value: 4 },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p16.variationParam(2, 1, 'corners'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 45, value: 2, easing: 'easeInOut' as const },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p16.variationParam(2, 1, 'circle'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 30, value: 1, easing: 'easeInOut' as const },
        { frame: 60, value: 8, easing: 'easeInOut' as const },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p16.variationParam(1, 0, 'power'),
      keyframes: [
        { frame: 0, value: 3.5 },
        { frame: 30, value: 1.5 },
        { frame: 60, value: 7 },
        { frame: 90, value: 3.5 },
      ],
    },
    {
      parameterPath: p16.variationParam(1, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 2.8 },
        { frame: 45, value: 0.8, easing: 'easeIn' as const },
        { frame: 90, value: 2.8 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: 2, easing: 'linear' as const },
      ],
    },
  ],
}

const anim16c: AnimationDef = {
  id: 'ex16-affine-blob-drift',
  name: 'Affine Blob Drift',
  description: 'Pre-affine coefficients drift changing the organic blob flow',
  exampleId: ex16,
  tracks: [
    {
      parameterPath: p16.transformPreAffine(1, 'a'),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 30, value: 0.6, easing: 'easeInOut' as const },
        { frame: 60, value: 0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: p16.transformPreAffine(1, 'd'),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 45, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p16.transformPreAffine(2, 'a'),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 30, value: 0.8, easing: 'easeInOut' as const },
        { frame: 60, value: 0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: p16.transformPreAffine(2, 'c'),
      keyframes: [
        { frame: 0, value: -0.02 },
        { frame: 45, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: -0.02 },
      ],
    },
    {
      parameterPath: p16.transformPreAffine(2, 'f'),
      keyframes: [
        { frame: 0, value: 0.02 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: -0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.02 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: -0.3, easing: 'easeInOut' as const },
        { frame: 60, value: 0.25, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 17 — Temporal Flux: cpow2Var+swirl, tradeVar+cosine, lissajousVar+sinusoidal
// Transform ordering (sorted):
//   T0=cpow2Var+swirl, T1=tradeVar+cosine, T2=lissajousVar+sinusoidal
//   T2 V0=lissajousVar, T2 V1=sinusoidal
// ---------------------------------------------------------------------------

const ex17 = 'example17' as const

const anim17a: AnimationDef = {
  id: 'ex17-cpow-orbit',
  name: 'Complex Power Orbits',
  description: 'CPow2 complex power params orbit while camera rotates slowly',
  exampleId: ex17,
  tracks: [
    {
      parameterPath: p17.variationParam(0, 0, 'r'),
      keyframes: [
        { frame: 0, value: 0.68 },
        { frame: 25, value: 0.3 },
        { frame: 50, value: 1.0 },
        { frame: 75, value: 0.5 },
        { frame: 90, value: 0.68 },
      ],
    },
    {
      parameterPath: p17.variationParam(0, 0, 'a'),
      keyframes: [
        { frame: 0, value: 0.1 },
        { frame: 30, value: 0.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0, easing: 'easeInOut' as const },
        { frame: 90, value: 0.1 },
      ],
    },
    {
      parameterPath: p17.variationParam(0, 0, 'divisor'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 45, value: 2 },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p17.variationParam(0, 0, 'range'),
      keyframes: [
        { frame: 0, value: 6 },
        { frame: 30, value: 10 },
        { frame: 60, value: 3 },
        { frame: 90, value: 6 },
      ],
    },
    {
      parameterPath: 'camera.rotation',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: Math.PI * 0.8, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.3 },
        { frame: 30, value: 0.6, easing: 'easeIn' as const },
        { frame: 60, value: 2.2, easing: 'easeOut' as const },
        { frame: 90, value: 1.3 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 45, value: 0.55, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
  ],
}

const anim17b: AnimationDef = {
  id: 'ex17-lissajous-flux',
  name: 'Lissajous Flux & Trade',
  description:
    'Lissajous time curves morph while trade attractor duality shifts',
  exampleId: ex17,
  tracks: [
    {
      parameterPath: p17.variationParam(2, 0, 'a'),
      keyframes: [
        { frame: 0, value: 3.0 },
        { frame: 25, value: 1.5 },
        { frame: 50, value: 5.0 },
        { frame: 75, value: 2.0 },
        { frame: 90, value: 3.0 },
      ],
    },
    {
      parameterPath: p17.variationParam(2, 0, 'b'),
      keyframes: [
        { frame: 0, value: 2.0 },
        { frame: 30, value: 4.0 },
        { frame: 60, value: 1.0 },
        { frame: 90, value: 2.0 },
      ],
    },
    {
      parameterPath: p17.variationParam(2, 0, 'c'),
      keyframes: [
        { frame: 0, value: 0.0 },
        { frame: 45, value: 1.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.0 },
      ],
    },
    {
      parameterPath: p17.variationParam(2, 0, 'd'),
      keyframes: [
        { frame: 0, value: 0.0 },
        { frame: 30, value: 0.8, easing: 'easeInOut' as const },
        { frame: 60, value: -0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.0 },
      ],
    },
    {
      parameterPath: p17.variationParam(1, 0, 'r1'),
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 45, value: 2.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: p17.variationParam(1, 0, 'r2'),
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 30, value: 0.3 },
        { frame: 60, value: 2.0 },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: p17.variationParam(1, 0, 'd1'),
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 45, value: 3.0, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: p17.variationParam(1, 0, 'd2'),
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 30, value: 2.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0, easing: 'easeInOut' as const },
        { frame: 60, value: 1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 10, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

const anim17c: AnimationDef = {
  id: 'ex17-trade-affine-flux',
  name: 'Trade Affine Flux',
  description:
    'Trade probability rises while post-affine coefficients warp the flux',
  exampleId: ex17,
  tracks: [
    {
      parameterPath: p17.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.45 },
        { frame: 25, value: 0.7 },
        { frame: 50, value: 0.15 },
        { frame: 75, value: 0.8 },
        { frame: 90, value: 0.45 },
      ],
    },
    {
      parameterPath: p17.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.2 },
        { frame: 60, value: 0.8 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p17.transformPostAffine(1, 'b'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: -0.4, easing: 'easeInOut' as const },
        { frame: 60, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: p17.transformPostAffine(1, 'a'),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 45, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: p17.transformPostAffine(1, 'e'),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 45, value: 1.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 30, value: 5 },
        { frame: 60, value: 40 },
        { frame: 90, value: 20 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 18 — Quantum Singularity (tunnel, curl, juliaScope, gaussian+rings)
// Transform ordering (sorted): T0=tunnel+hyperbolic, T1=curl+spiral+linear,
//   T2=juliaScope+swirl, T3=gaussian+rings
// ---------------------------------------------------------------------------

const ex18 = 'example18' as const

const anim18a: AnimationDef = {
  id: 'ex18-gravitational-collapse',
  name: 'Gravitational Collapse',
  description:
    'Tunnel breathes like a collapsing star while the event horizon pulses and camera dives in',
  exampleId: ex18,
  tracks: [
    {
      parameterPath: p18.variationParam(0, 0, 'Sx'),
      keyframes: [
        { frame: 0, value: 200 },
        { frame: 25, value: 80, easing: 'easeIn' as const },
        { frame: 50, value: 350, easing: 'easeOut' as const },
        { frame: 75, value: 120, easing: 'easeIn' as const },
        { frame: 90, value: 200 },
      ],
    },
    {
      parameterPath: p18.variationParam(0, 0, 'Sy'),
      keyframes: [
        { frame: 0, value: 50 },
        { frame: 30, value: 120, easing: 'easeInOut' as const },
        { frame: 60, value: 20, easing: 'easeInOut' as const },
        { frame: 90, value: 50 },
      ],
    },
    {
      parameterPath: p18.variationParam(2, 0, 'power'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 30, value: 2, easing: 'easeInOut' as const },
        { frame: 60, value: 7, easing: 'easeInOut' as const },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p18.variationParam(2, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 2.5 },
        { frame: 45, value: 1.2, easing: 'easeIn' as const },
        { frame: 90, value: 2.5, easing: 'easeOut' as const },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.3 },
        { frame: 40, value: 2.2, easing: 'easeIn' as const },
        { frame: 70, value: 0.6, easing: 'easeOut' as const },
        { frame: 90, value: 1.3 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0.03 },
        { frame: 30, value: 0.2, easing: 'easeInOut' as const },
        { frame: 60, value: -0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0.03 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.28 },
        { frame: 40, value: 0.55, easing: 'easeInOut' as const },
        { frame: 80, value: 0.12, easing: 'easeInOut' as const },
        { frame: 90, value: 0.28 },
      ],
    },
  ],
}

const anim18b: AnimationDef = {
  id: 'ex18-spacetime-ripple',
  name: 'Spacetime Ripple',
  description:
    'Curl quantum spin creates gravitational waves while hyperbolic shear, spiral arms, and skipIters cascade',
  exampleId: ex18,
  tracks: [
    {
      parameterPath: p18.variationParam(1, 0, 'c1'),
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 20, value: 0.3, easing: 'easeInOut' as const },
        { frame: 40, value: 2.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.8, easing: 'easeInOut' as const },
        { frame: 80, value: 1.8, easing: 'easeInOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: p18.variationParam(1, 0, 'c2'),
      keyframes: [
        { frame: 0, value: 0.8 },
        { frame: 25, value: 2.0, easing: 'easeInOut' as const },
        { frame: 50, value: 0.3, easing: 'easeInOut' as const },
        { frame: 75, value: 1.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.8 },
      ],
    },
    {
      parameterPath: p18.variationWeight(0, 1),
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 30, value: 0.6, easing: 'easeInOut' as const },
        { frame: 60, value: 0.05, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
    {
      parameterPath: p18.variationWeight(1, 1),
      keyframes: [
        { frame: 0, value: 0.35 },
        { frame: 35, value: 0.05, easing: 'easeInOut' as const },
        { frame: 70, value: 0.7, easing: 'easeInOut' as const },
        { frame: 90, value: 0.35 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 25 },
        { frame: 25, value: 5 },
        { frame: 50, value: 50 },
        { frame: 75, value: 10 },
        { frame: 90, value: 25 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: -0.02 },
        { frame: 30, value: 0.25, easing: 'easeInOut' as const },
        { frame: 60, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: -0.02 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

const anim18c: AnimationDef = {
  id: 'ex18-event-horizon-cascade',
  name: 'Event Horizon Cascade',
  description:
    'Probability cascade shifts the dominant transform, swirl spins the horizon, accretion rings pulse, and palette cycles',
  exampleId: ex18,
  tracks: [
    {
      parameterPath: p18.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.55 },
        { frame: 30, value: 0.15 },
        { frame: 60, value: 0.8 },
        { frame: 90, value: 0.55 },
      ],
    },
    {
      parameterPath: p18.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 25, value: 0.7 },
        { frame: 55, value: 0.1 },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: p18.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 40, value: 0.05 },
        { frame: 80, value: 0.55 },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: p18.variationWeight(2, 1),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 30, value: 0.8, easing: 'easeInOut' as const },
        { frame: 60, value: 0.05, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: p18.variationWeight(3, 1),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 40, value: 3.5, easing: 'easeInOut' as const },
        { frame: 80, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: 1, easing: 'linear' as const },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 19 — Neon Basilica (rectangles, invEllipse, hexes, fan2)
// Transform ordering (sorted):
//   T0=rectangles+arch+linear, T1=invEllipse+cross+sinusoidal,
//   T2=hexes+squarize, T3=fan2+heart+linear
// ---------------------------------------------------------------------------

const ex19 = 'example19' as const

const anim19a: AnimationDef = {
  id: 'ex19-cathedral-morph',
  name: 'Cathedral Morph',
  description:
    'Gothic windows reshape as rectangles x/y morph, invEllipse halos breathe, camera drifts through the nave',
  exampleId: ex19,
  tracks: [
    {
      parameterPath: p19.variationParam(0, 0, 'x'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 30, value: 2, easing: 'easeInOut' as const },
        { frame: 60, value: 6, easing: 'easeInOut' as const },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p19.variationParam(0, 0, 'y'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 20, value: 3, easing: 'easeInOut' as const },
        { frame: 50, value: 8, easing: 'easeInOut' as const },
        { frame: 80, value: 4, easing: 'easeInOut' as const },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p19.variationParam(1, 0, 'a'),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: 1.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: p19.variationParam(1, 0, 'b'),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p19.variationParam(1, 0, 'h'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 35, value: 0.3, easing: 'easeInOut' as const },
        { frame: 70, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 40, value: 0.25, easing: 'easeInOut' as const },
        { frame: 80, value: -0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 30, value: 1.6, easing: 'easeIn' as const },
        { frame: 60, value: 0.8, easing: 'easeOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
  ],
}

const anim19b: AnimationDef = {
  id: 'ex19-stained-glass-kaleidoscope',
  name: 'Stained Glass Kaleidoscope',
  description:
    'Hexes rotate the tessellation, cellsize breathes, rose window fans shift, and sacred geometry distorts',
  exampleId: ex19,
  tracks: [
    {
      parameterPath: p19.variationParam(2, 0, 'rotate'),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 90, value: Math.PI * 2 + 0.3, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: p19.variationParam(2, 0, 'cellsize'),
      keyframes: [
        { frame: 0, value: 0.1 },
        { frame: 30, value: 0.03, easing: 'easeInOut' as const },
        { frame: 60, value: 0.25, easing: 'easeInOut' as const },
        { frame: 90, value: 0.1 },
      ],
    },
    {
      parameterPath: p19.variationParam(2, 0, 'scale'),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 25, value: 0.3, easing: 'easeInOut' as const },
        { frame: 50, value: 1.2, easing: 'easeInOut' as const },
        { frame: 75, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: p19.variationParam(3, 0, 'x'),
      keyframes: [
        { frame: 0, value: 0.8 },
        { frame: 30, value: 0.4, easing: 'easeInOut' as const },
        { frame: 60, value: 1.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.8 },
      ],
    },
    {
      parameterPath: p19.variationParam(3, 0, 'y'),
      keyframes: [
        { frame: 0, value: 0.6 },
        { frame: 45, value: 1.0, easing: 'easeInOut' as const },
        { frame: 90, value: 0.6 },
      ],
    },
    {
      parameterPath: p19.variationWeight(2, 1),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 30, value: 0.7, easing: 'easeInOut' as const },
        { frame: 60, value: 0.05, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 35, value: 0.2, easing: 'easeInOut' as const },
        { frame: 70, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

const anim19c: AnimationDef = {
  id: 'ex19-neon-genesis',
  name: 'Neon Genesis',
  description:
    'Cathedral builds from nothing: probabilities cascade, invEllipse restricted toggles, palette shifts, cross emerges',
  exampleId: ex19,
  tracks: [
    {
      parameterPath: p19.transformProbability(3),
      keyframes: [
        { frame: 0, value: 0.05 },
        { frame: 30, value: 0.3, easing: 'easeIn' as const },
        { frame: 60, value: 0.05, easing: 'easeOut' as const },
        { frame: 90, value: 0.15 },
      ],
    },
    {
      parameterPath: p19.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.1 },
        { frame: 40, value: 0.55, easing: 'easeIn' as const },
        { frame: 70, value: 0.2, easing: 'easeOut' as const },
        { frame: 90, value: 0.35 },
      ],
    },
    {
      parameterPath: p19.variationParam(1, 0, 'restricted'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 40, value: 1 },
        { frame: 80, value: 0 },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 35, value: 4, easing: 'easeInOut' as const },
        { frame: 65, value: 0.8, easing: 'easeInOut' as const },
        { frame: 90, value: 2, easing: 'easeOut' as const },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.15 },
        { frame: 40, value: 0.45, easing: 'easeIn' as const },
        { frame: 70, value: 0.1, easing: 'easeOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 45, value: 1.8, easing: 'easeInOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 20 — Abyssal Bloom (blob, bubble+circus, waves+swirl3, horseshoe+popcorn2)
// Transform ordering (sorted):
//   T0=blob+fan2, T1=bubble+circus+sinusoidal, T2=waves+swirl3,
//   T3=horseshoe+popcorn2+linear
// ---------------------------------------------------------------------------

const ex20 = 'example20' as const

const anim20a: AnimationDef = {
  id: 'ex20-bioluminescent-pulse',
  name: 'Bioluminescent Pulse',
  description:
    'Organic blobs breathe with bioluminescent rhythm as circus scales dance and exposure flickers like deep-sea light',
  exampleId: ex20,
  tracks: [
    {
      parameterPath: p20.variationParam(0, 0, 'high'),
      keyframes: [
        { frame: 0, value: 2.5 },
        { frame: 25, value: 5, easing: 'easeInOut' as const },
        { frame: 50, value: 1.5, easing: 'easeInOut' as const },
        { frame: 75, value: 4, easing: 'easeInOut' as const },
        { frame: 90, value: 2.5 },
      ],
    },
    {
      parameterPath: p20.variationParam(0, 0, 'low'),
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: 2, easing: 'easeInOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: p20.variationParam(0, 0, 'waves'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 20, value: 5 },
        { frame: 40, value: 1 },
        { frame: 60, value: 7 },
        { frame: 80, value: 2 },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p20.variationParam(1, 1, 'scale'),
      keyframes: [
        { frame: 0, value: 0.85 },
        { frame: 30, value: 0.4, easing: 'easeInOut' as const },
        { frame: 60, value: 1.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0.85 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.22 },
        { frame: 25, value: 0.5, easing: 'easeInOut' as const },
        { frame: 50, value: 0.08, easing: 'easeInOut' as const },
        { frame: 75, value: 0.45, easing: 'easeInOut' as const },
        { frame: 90, value: 0.22 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 20, value: 0.1, easing: 'easeInOut' as const },
        { frame: 40, value: 0.9, easing: 'easeInOut' as const },
        { frame: 60, value: 0.3, easing: 'easeInOut' as const },
        { frame: 80, value: 0.8, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 22, value: 1.85, easing: 'easeInOut' as const },
        { frame: 45, value: 0.55, easing: 'easeInOut' as const },
        { frame: 67, value: 1.4, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.2, easing: 'easeInOut' as const },
        { frame: 60, value: -0.18, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
  ],
}

const anim20b: AnimationDef = {
  id: 'ex20-coral-vortex',
  name: 'Coral Vortex',
  description:
    'Swirl3 spirals rotate through coral fronds while waves undulate, popcorn2 crystallizes, and camera dives deeper',
  exampleId: ex20,
  tracks: [
    {
      parameterPath: p20.variationParam(2, 1, 'shift'),
      keyframes: [
        { frame: 0, value: 7 },
        { frame: 25, value: 2, easing: 'easeInOut' as const },
        { frame: 50, value: 18, easing: 'easeInOut' as const },
        { frame: 75, value: 4, easing: 'easeInOut' as const },
        { frame: 90, value: 7 },
      ],
    },
    {
      parameterPath: p20.variationWeight(2, 1),
      keyframes: [
        { frame: 0, value: 0.45 },
        { frame: 30, value: 0.8, easing: 'easeInOut' as const },
        { frame: 60, value: 0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.45 },
      ],
    },
    {
      parameterPath: p20.variationParam(3, 1, 'x'),
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 35, value: 0.4, easing: 'easeInOut' as const },
        { frame: 70, value: 2.0, easing: 'easeInOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: p20.variationParam(3, 1, 'c'),
      keyframes: [
        { frame: 0, value: 1.8 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1.8 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: -0.04 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: -0.35, easing: 'easeInOut' as const },
        { frame: 90, value: -0.04 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.15 },
        { frame: 40, value: 2.0, easing: 'easeIn' as const },
        { frame: 80, value: 0.7, easing: 'easeOut' as const },
        { frame: 90, value: 1.15 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: 1, easing: 'linear' as const },
      ],
    },
  ],
}

const anim20c: AnimationDef = {
  id: 'ex20-abyssal-genesis',
  name: 'Abyssal Genesis',
  description:
    'Life emerges from the void: probabilities bloom, fan2 membranes unfurl, bubble chains rise, and the abyss awakens',
  exampleId: ex20,
  tracks: [
    {
      parameterPath: p20.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 35, value: 0.7, easing: 'easeIn' as const },
        { frame: 55, value: 0.4 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p20.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.6 },
        { frame: 30, value: 0.15 },
        { frame: 65, value: 0.55, easing: 'easeInOut' as const },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: p20.transformProbability(3),
      keyframes: [
        { frame: 0, value: 0.05 },
        { frame: 50, value: 0.35, easing: 'easeIn' as const },
        { frame: 90, value: 0.2 },
      ],
    },
    {
      parameterPath: p20.variationWeight(0, 1),
      keyframes: [
        { frame: 0, value: 0.05 },
        { frame: 40, value: 0.6, easing: 'easeIn' as const },
        { frame: 70, value: 0.2, easing: 'easeOut' as const },
        { frame: 90, value: 0.35 },
      ],
    },
    {
      parameterPath: p20.variationWeight(1, 0),
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 30, value: 1.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.5 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 40 },
        { frame: 25, value: 15 },
        { frame: 50, value: 5 },
        { frame: 75, value: 20 },
        { frame: 90, value: 20 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.08 },
        { frame: 45, value: 0.4, easing: 'easeIn' as const },
        { frame: 75, value: 0.15 },
        { frame: 90, value: 0.22 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 21 — Cyber Mandala (ngon+squish, starBlur+radialBlur, pdj+diamond+rings2, juliaN+fan)
// Transform ordering (sorted):
//   T0=ngon+squish, T1=starBlur+radialBlur+linear, T2=pdj+diamond+rings2,
//   T3=juliaN+fan+linear
// ---------------------------------------------------------------------------

const ex21 = 'example21' as const

const anim21a: AnimationDef = {
  id: 'ex21-mandala-unfolding',
  name: 'Mandala Unfolding',
  description:
    'The mandala unfolds from simplicity: n-gon sides increase, starBlur power radiates, camera zooms out as complexity blooms',
  exampleId: ex21,
  tracks: [
    {
      parameterPath: p21.variationParam(0, 0, 'sides'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 20, value: 5 },
        { frame: 40, value: 9 },
        { frame: 60, value: 7 },
        { frame: 80, value: 12 },
        { frame: 90, value: 6 },
      ],
    },
    {
      parameterPath: p21.variationParam(0, 0, 'corners'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 30, value: 6, easing: 'easeInOut' as const },
        { frame: 60, value: 3, easing: 'easeInOut' as const },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p21.variationParam(0, 0, 'circle'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 5, easing: 'easeIn' as const },
        { frame: 90, value: 2 },
      ],
    },
    {
      parameterPath: p21.variationParam(1, 0, 'power'),
      keyframes: [
        { frame: 0, value: 2 },
        { frame: 25, value: 8, easing: 'easeInOut' as const },
        { frame: 50, value: 3, easing: 'easeInOut' as const },
        { frame: 75, value: 10, easing: 'easeInOut' as const },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p21.variationParam(1, 0, 'range'),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 30, value: 0.15, easing: 'easeInOut' as const },
        { frame: 60, value: 0.8, easing: 'easeInOut' as const },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 2.0 },
        { frame: 40, value: 0.8, easing: 'easeOut' as const },
        { frame: 80, value: 1.6, easing: 'easeIn' as const },
        { frame: 90, value: 1.25 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 40, value: 0.9, easing: 'easeIn' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

const anim21b: AnimationDef = {
  id: 'ex21-parametric-crystallization',
  name: 'Parametric Crystallization',
  description:
    'PDJ attractor parameters drift through alien geometries while rings oscillate, juliaN power deepens, and colors cycle',
  exampleId: ex21,
  tracks: [
    {
      parameterPath: p21.variationParam(2, 0, 'a'),
      keyframes: [
        { frame: 0, value: 0.8 },
        { frame: 22, value: -1.2, easing: 'easeInOut' as const },
        { frame: 45, value: 2.0, easing: 'easeInOut' as const },
        { frame: 67, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0.8 },
      ],
    },
    {
      parameterPath: p21.variationParam(2, 0, 'b'),
      keyframes: [
        { frame: 0, value: 1.5 },
        { frame: 30, value: -0.8, easing: 'easeInOut' as const },
        { frame: 60, value: 2.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1.5 },
      ],
    },
    {
      parameterPath: p21.variationParam(2, 0, 'c'),
      keyframes: [
        { frame: 0, value: -0.5 },
        { frame: 25, value: 2.0, easing: 'easeInOut' as const },
        { frame: 50, value: -1.5, easing: 'easeInOut' as const },
        { frame: 75, value: 1.0, easing: 'easeInOut' as const },
        { frame: 90, value: -0.5 },
      ],
    },
    {
      parameterPath: p21.variationParam(2, 0, 'd'),
      keyframes: [
        { frame: 0, value: 2.0 },
        { frame: 35, value: 0.3, easing: 'easeInOut' as const },
        { frame: 70, value: 3.5, easing: 'easeInOut' as const },
        { frame: 90, value: 2.0 },
      ],
    },
    {
      parameterPath: p21.variationParam(2, 2, 'val'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 22, value: 2 },
        { frame: 45, value: 10 },
        { frame: 67, value: 3 },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p21.variationParam(3, 0, 'power'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 30, value: 2, easing: 'easeInOut' as const },
        { frame: 60, value: 8, easing: 'easeInOut' as const },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 45, value: 6, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 30, value: 3 },
        { frame: 60, value: 40 },
        { frame: 90, value: 20 },
      ],
    },
  ],
}

const anim21c: AnimationDef = {
  id: 'ex21-sacred-spin',
  name: 'Sacred Spin',
  description:
    'RadialBlur rotates the starburst, squish power warps geometry, n-gon power shifts, diamond facets glint',
  exampleId: ex21,
  tracks: [
    {
      parameterPath: p21.variationParam(1, 1, 'angle'),
      keyframes: [
        { frame: 0, value: Math.PI * 0.5 },
        { frame: 90, value: Math.PI * 4.5, easing: 'linear' as const },
      ],
    },
    {
      parameterPath: p21.variationParam(0, 1, 'power'),
      keyframes: [
        { frame: 0, value: 1.5 },
        { frame: 30, value: 4, easing: 'easeInOut' as const },
        { frame: 60, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1.5 },
      ],
    },
    {
      parameterPath: p21.variationParam(0, 0, 'power'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 25, value: 7, easing: 'easeInOut' as const },
        { frame: 50, value: 1.5, easing: 'easeInOut' as const },
        { frame: 75, value: 5, easing: 'easeInOut' as const },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p21.variationWeight(2, 1),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 20, value: 0.1, easing: 'easeInOut' as const },
        { frame: 40, value: 0.9, easing: 'easeInOut' as const },
        { frame: 60, value: 0.2 },
        { frame: 80, value: 0.7, easing: 'easeInOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p21.variationWeight(1, 1),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 35, value: 0.8, easing: 'easeInOut' as const },
        { frame: 70, value: 0.05, easing: 'easeInOut' as const },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.15, easing: 'easeInOut' as const },
        { frame: 60, value: -0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: -0.15, easing: 'easeInOut' as const },
        { frame: 60, value: 0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 22 — Phoenix Ascension (butterfly+diamond, heart+fan+tangent, scry2+sinusoidal, linearTVar+gaussian)
// Transform ordering (sorted):
//   T0=butterfly+diamond+linear, T1=heart+fan+tangent,
//   T2=scry2+sinusoidal, T3=gaussian+linearTVar
// ---------------------------------------------------------------------------

const ex22 = 'example22' as const

const anim22a: AnimationDef = {
  id: 'ex22-phoenix-rising',
  name: 'Phoenix Rising',
  description:
    'The firebird ascends: camera pans upward, scry2 flames intensify, exposure builds like fire, sparks distort',
  exampleId: ex22,
  tracks: [
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: -0.05 },
        { frame: 25, value: 0.35, easing: 'easeInOut' as const },
        { frame: 50, value: -0.25, easing: 'easeInOut' as const },
        { frame: 75, value: 0.45, easing: 'easeInOut' as const },
        { frame: 90, value: 0.1, easing: 'easeOut' as const },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.2, easing: 'easeInOut' as const },
        { frame: 60, value: -0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: p22.variationParam(2, 0, 'star'),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 25, value: 0.8, easing: 'easeIn' as const },
        { frame: 50, value: 0.1, easing: 'easeOut' as const },
        { frame: 75, value: 1.2, easing: 'easeIn' as const },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: p22.variationParam(2, 0, 'circle'),
      keyframes: [
        { frame: 0, value: 0.1 },
        { frame: 35, value: 1.5, easing: 'easeInOut' as const },
        { frame: 70, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.1 },
      ],
    },
    {
      parameterPath: p22.variationParam(2, 0, 'sides'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 30, value: 8 },
        { frame: 60, value: 3 },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p22.variationParam(3, 1, 'powX'),
      keyframes: [
        { frame: 0, value: 1.5 },
        { frame: 30, value: 3.0, easing: 'easeInOut' as const },
        { frame: 60, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1.5 },
      ],
    },
    {
      parameterPath: p22.variationParam(3, 1, 'powY'),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 45, value: 2.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 25, value: 0.5, easing: 'easeIn' as const },
        { frame: 50, value: 0.08, easing: 'easeOut' as const },
        { frame: 75, value: 0.55, easing: 'easeIn' as const },
        { frame: 90, value: 0.32 },
      ],
    },
  ],
}

const anim22b: AnimationDef = {
  id: 'ex22-wing-flutter',
  name: 'Wing Flutter',
  description:
    'Butterfly wings pulse in rapid flutter, diamond facets glint in counterpoint, heart/fan alternate like breathing',
  exampleId: ex22,
  tracks: [
    {
      parameterPath: p22.variationWeight(0, 0),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 8, value: 0.2, easing: 'easeOut' as const },
        { frame: 16, value: 1.5, easing: 'easeIn' as const },
        { frame: 24, value: 0.3, easing: 'easeOut' as const },
        { frame: 32, value: 1.5, easing: 'easeIn' as const },
        { frame: 40, value: 0.5 },
        { frame: 55, value: 1.8, easing: 'easeInOut' as const },
        { frame: 70, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p22.variationWeight(0, 1),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 10, value: 1.2, easing: 'easeIn' as const },
        { frame: 20, value: 0.1, easing: 'easeOut' as const },
        { frame: 30, value: 1.0, easing: 'easeIn' as const },
        { frame: 40, value: 0.3 },
        { frame: 55, value: 0.8, easing: 'easeInOut' as const },
        { frame: 70, value: 0.05, easing: 'easeInOut' as const },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: p22.variationWeight(1, 0),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 20, value: 0.3, easing: 'easeInOut' as const },
        { frame: 40, value: 1.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.4, easing: 'easeInOut' as const },
        { frame: 80, value: 1.3, easing: 'easeInOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: p22.variationWeight(1, 1),
      keyframes: [
        { frame: 0, value: 0.35 },
        { frame: 15, value: 0.8, easing: 'easeIn' as const },
        { frame: 35, value: 0.1, easing: 'easeOut' as const },
        { frame: 50, value: 0.7, easing: 'easeIn' as const },
        { frame: 65, value: 0.05, easing: 'easeOut' as const },
        { frame: 90, value: 0.35 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 20, value: 0.9, easing: 'easeIn' as const },
        { frame: 40, value: 0.2, easing: 'easeOut' as const },
        { frame: 60, value: 0.85, easing: 'easeIn' as const },
        { frame: 80, value: 0.3, easing: 'easeOut' as const },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.1 },
        { frame: 25, value: 1.5, easing: 'easeIn' as const },
        { frame: 50, value: 0.8, easing: 'easeOut' as const },
        { frame: 75, value: 1.4, easing: 'easeIn' as const },
        { frame: 90, value: 1.1 },
      ],
    },
  ],
}

const anim22c: AnimationDef = {
  id: 'ex22-color-inferno',
  name: 'Color Inferno',
  description:
    'Firebird ignites into color madness: paletteSpeed accelerates, tangent wisps surge, heart pounds, skipIters drops for maximum detail',
  exampleId: ex22,
  tracks: [
    {
      parameterPath: 'paletteSpeed',
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 20, value: 2, easing: 'easeIn' as const },
        { frame: 40, value: 8, easing: 'easeIn' as const },
        { frame: 55, value: 15, easing: 'easeIn' as const },
        { frame: 70, value: 2, easing: 'easeOut' as const },
        { frame: 85, value: 0.5, easing: 'easeOut' as const },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.7, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3, easing: 'easeOut' as const },
      ],
    },
    {
      parameterPath: p22.variationWeight(1, 2),
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 30, value: 0.8, easing: 'easeIn' as const },
        { frame: 60, value: 0.05, easing: 'easeOut' as const },
        { frame: 90, value: 0.2 },
      ],
    },
    {
      parameterPath: p22.variationWeight(1, 0),
      keyframes: [
        { frame: 0, value: 1 },
        { frame: 25, value: 0.2, easing: 'easeInOut' as const },
        { frame: 50, value: 2.0, easing: 'easeInOut' as const },
        { frame: 75, value: 0.5 },
        { frame: 90, value: 1 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 18 },
        { frame: 25, value: 2 },
        { frame: 50, value: 1 },
        { frame: 70, value: 15 },
        { frame: 90, value: 18 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.32 },
        { frame: 20, value: 0.6, easing: 'easeIn' as const },
        { frame: 45, value: 0.05, easing: 'easeOut' as const },
        { frame: 65, value: 0.7, easing: 'easeIn' as const },
        { frame: 85, value: 0.25 },
        { frame: 90, value: 0.32 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 25, value: 1, easing: 'easeIn' as const },
        { frame: 50, value: 0, easing: 'easeOut' as const },
        { frame: 75, value: 1, easing: 'easeIn' as const },
        { frame: 90, value: 0.5 },
      ],
    },
  ],
}

// Example 23 — Cosmic Swirl: fan2+swirl3Var spiral arms, juliaScope+curlVar core, horseshoe warp
// Transform ordering (sorted): T0=fan2+swirl3Var, T1=juliaScope+curlVar, T2=horseshoe+swirl
//
//   T0: V0=fan2, V1=swirl3Var
//   T1: V0=juliaScope, V1=curlVar
//   T2: V0=horseshoe, V1=swirl
// ---------------------------------------------------------------------------

const ex23 = 'example23' as const

const anim23a: AnimationDef = {
  id: 'ex23-galactic-spin',
  name: 'Galactic Spin',
  description:
    'Swirl arms rotate through log-spiral shift, julia power pulse, and camera zoom through the nebula',
  exampleId: ex23,
  tracks: [
    {
      parameterPath: p23.variationParam(0, 0, 'y'),
      keyframes: [
        { frame: 0, value: 0.75 },
        { frame: 30, value: 0.3 },
        { frame: 60, value: 0.95 },
        { frame: 90, value: 0.75 },
      ],
    },
    {
      parameterPath: p23.variationParam(0, 1, 'shift'),
      keyframes: [
        { frame: 0, value: 4.5 },
        { frame: 45, value: 2, easing: 'easeInOut' as const },
        { frame: 90, value: 4.5 },
      ],
    },
    {
      parameterPath: p23.variationParam(1, 0, 'power'),
      keyframes: [
        { frame: 0, value: 4 },
        { frame: 30, value: 2.5, easing: 'easeInOut' as const },
        { frame: 60, value: 6, easing: 'easeInOut' as const },
        { frame: 90, value: 4 },
      ],
    },
    {
      parameterPath: p23.variationParam(1, 1, 'c1'),
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 45, value: 2.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 40, value: 0.55, easing: 'easeInOut' as const },
        { frame: 80, value: 1.5, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.65 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.65 },
      ],
    },
    {
      parameterPath: 'highlightPower',
      keyframes: [
        { frame: 0, value: 0.55 },
        { frame: 30, value: 0.85, easing: 'easeInOut' as const },
        { frame: 60, value: 0.35 },
        { frame: 90, value: 0.55 },
      ],
    },
  ],
}

const anim23b: AnimationDef = {
  id: 'ex23-probability-cosmos',
  name: 'Probability Cosmos',
  description:
    'Transform probabilities shift, creating evolving structure as the nebula reforms itself',
  exampleId: ex23,
  tracks: [
    {
      parameterPath: p23.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 25, value: 0.8 },
        { frame: 50, value: 0.15 },
        { frame: 75, value: 0.6 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p23.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.35 },
        { frame: 25, value: 0.1 },
        { frame: 50, value: 0.7 },
        { frame: 75, value: 0.25 },
        { frame: 90, value: 0.35 },
      ],
    },
    {
      parameterPath: p23.variationParam(1, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 30, value: 1, easing: 'easeInOut' as const },
        { frame: 60, value: 5.5, easing: 'easeInOut' as const },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p23.transformPreAffine(1, 'e'),
      keyframes: [
        { frame: 0, value: 0.35 },
        { frame: 30, value: 0.6, easing: 'easeInOut' as const },
        { frame: 60, value: 0.2 },
        { frame: 90, value: 0.35 },
      ],
    },
    {
      parameterPath: 'contrast',
      keyframes: [
        { frame: 0, value: 1.15 },
        { frame: 45, value: 1.6, easing: 'easeInOut' as const },
        { frame: 90, value: 1.15 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.22 },
        { frame: 45, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.22 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 24 — Crystal Lattice: hexes+ngonVar, rings2+perspective, linearTVar+spherical
// Transform ordering (sorted): T0=hexesVar+ngonVar, T1=perspective+rings2, T2=linearTVar+spherical
//
//   T0: V0=hexesVar, V1=ngonVar
//   T1: V0=perspective, V1=rings2
//   T2: V0=linearTVar, V1=spherical
// ---------------------------------------------------------------------------

const ex24 = 'example24' as const

const anim24a: AnimationDef = {
  id: 'ex24-crystal-growth',
  name: 'Crystal Growth',
  description:
    'Hex lattice cells breathe, n-gon sides morph, and rings2 pulses as the crystal lattice grows and contracts',
  exampleId: ex24,
  tracks: [
    {
      parameterPath: p24.variationParam(0, 0, 'cellsize'),
      keyframes: [
        { frame: 0, value: 0.14 },
        { frame: 30, value: 0.08, easing: 'easeInOut' as const },
        { frame: 60, value: 0.22, easing: 'easeInOut' as const },
        { frame: 90, value: 0.14 },
      ],
    },
    {
      parameterPath: p24.variationParam(0, 0, 'power'),
      keyframes: [
        { frame: 0, value: 1.1 },
        { frame: 45, value: 1.8, easing: 'easeInOut' as const },
        { frame: 90, value: 1.1 },
      ],
    },
    {
      parameterPath: p24.variationParam(0, 1, 'sides'),
      keyframes: [
        { frame: 0, value: 5 },
        { frame: 30, value: 3, easing: 'easeInOut' as const },
        { frame: 60, value: 7, easing: 'easeInOut' as const },
        { frame: 90, value: 5 },
      ],
    },
    {
      parameterPath: p24.variationParam(0, 1, 'circle'),
      keyframes: [
        { frame: 0, value: 3 },
        { frame: 45, value: 1, easing: 'easeInOut' as const },
        { frame: 90, value: 3 },
      ],
    },
    {
      parameterPath: p24.variationParam(1, 1, 'val'),
      keyframes: [
        { frame: 0, value: 5.5 },
        { frame: 25, value: 3, easing: 'easeInOut' as const },
        { frame: 50, value: 8, easing: 'easeInOut' as const },
        { frame: 75, value: 4 },
        { frame: 90, value: 5.5 },
      ],
    },
    {
      parameterPath: p24.variationParam(1, 0, 'angle'),
      keyframes: [
        { frame: 0, value: 0.6 },
        { frame: 45, value: 1.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.6 },
      ],
    },
    {
      parameterPath: p24.variationParam(2, 0, 'powY'),
      keyframes: [
        { frame: 0, value: 1.3 },
        { frame: 30, value: 0.6, easing: 'easeInOut' as const },
        { frame: 60, value: 2.0, easing: 'easeInOut' as const },
        { frame: 90, value: 1.3 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.05 },
        { frame: 45, value: 0.7, easing: 'easeInOut' as const },
        { frame: 90, value: 1.05 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.26 },
        { frame: 45, value: 0.45, easing: 'easeInOut' as const },
        { frame: 90, value: 0.26 },
      ],
    },
  ],
}

const anim24b: AnimationDef = {
  id: 'ex24-prismatic-shift',
  name: 'Prismatic Shift',
  description:
    'Perspective depth warps the rings into 3D as probability flows shift the crystal structure',
  exampleId: ex24,
  tracks: [
    {
      parameterPath: p24.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.7 },
        { frame: 60, value: 0.2 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p24.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 30, value: 0.15 },
        { frame: 60, value: 0.65 },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: p24.variationParam(1, 0, 'dist'),
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 30, value: 0.5, easing: 'easeInOut' as const },
        { frame: 60, value: 2.0, easing: 'easeInOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: p24.transformPostAffine(1, 'b'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: p24.transformPostAffine(1, 'd'),
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.6 },
        { frame: 45, value: 0.95, easing: 'easeInOut' as const },
        { frame: 90, value: 0.6 },
      ],
    },
    {
      parameterPath: 'highlightPower',
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 30, value: 0.8, easing: 'easeInOut' as const },
        { frame: 60, value: 0.3 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: 'skipIters',
      keyframes: [
        { frame: 0, value: 20 },
        { frame: 45, value: 5, easing: 'easeInOut' as const },
        { frame: 90, value: 20 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 25 — Quantum Tunnel: tunnelVar+swirl, spirographVar+sinusoidal, butterflyVar+hyperbolic
// Transform ordering (sorted): T0=tunnelVar+swirl, T1=spirographVar+sinusoidal, T2=butterflyVar+hyperbolic
//
//   T0: V0=tunnelVar, V1=swirl
//   T1: V0=spirographVar, V1=sinusoidal
//   T2: V0=butterflyVar, V1=hyperbolic
// ---------------------------------------------------------------------------

const ex25 = 'example25' as const

const anim25a: AnimationDef = {
  id: 'ex25-quantum-drift',
  name: 'Quantum Drift',
  description:
    'Tunnel width shifts, spirograph epicycles morph through parameter space, camera drifts through the quantum corridor',
  exampleId: ex25,
  tracks: [
    {
      parameterPath: p25.variationParam(0, 0, 'Sx'),
      keyframes: [
        { frame: 0, value: 120 },
        { frame: 30, value: 60, easing: 'easeInOut' as const },
        { frame: 60, value: 200, easing: 'easeInOut' as const },
        { frame: 90, value: 120 },
      ],
    },
    {
      parameterPath: p25.variationParam(0, 0, 'Sy'),
      keyframes: [
        { frame: 0, value: 40 },
        { frame: 30, value: 80, easing: 'easeInOut' as const },
        { frame: 60, value: 15, easing: 'easeInOut' as const },
        { frame: 90, value: 40 },
      ],
    },
    {
      parameterPath: p25.variationParam(1, 0, 'a'),
      keyframes: [
        { frame: 0, value: 3.5 },
        { frame: 30, value: 2, easing: 'easeInOut' as const },
        { frame: 60, value: 5, easing: 'easeInOut' as const },
        { frame: 90, value: 3.5 },
      ],
    },
    {
      parameterPath: p25.variationParam(1, 0, 'b'),
      keyframes: [
        { frame: 0, value: 1.8 },
        { frame: 45, value: 3.2, easing: 'easeInOut' as const },
        { frame: 90, value: 1.8 },
      ],
    },
    {
      parameterPath: p25.variationParam(1, 0, 'd'),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 30, value: -0.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.8, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: p25.variationParam(1, 0, 'c1'),
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 45, value: -1.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.2 },
      ],
    },
    {
      parameterPath: p25.variationParam(1, 0, 'c2'),
      keyframes: [
        { frame: 0, value: -0.15 },
        { frame: 45, value: 1, easing: 'easeInOut' as const },
        { frame: 90, value: -0.15 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 40, value: 0.5, easing: 'easeIn' as const },
        { frame: 70, value: 1.6, easing: 'easeOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.28 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.28 },
      ],
    },
  ],
}

const anim25b: AnimationDef = {
  id: 'ex25-iridescent-surge',
  name: 'Iridescent Surge',
  description:
    'Butterfly iridescence blooms, hyperbolic curvature warps, and probability shifts cause the tunnel to surge with color',
  exampleId: ex25,
  tracks: [
    {
      parameterPath: p25.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.5 },
        { frame: 25, value: 0.75 },
        { frame: 50, value: 0.2 },
        { frame: 75, value: 0.6 },
        { frame: 90, value: 0.5 },
      ],
    },
    {
      parameterPath: p25.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.45 },
        { frame: 25, value: 0.15 },
        { frame: 50, value: 0.7 },
        { frame: 75, value: 0.3 },
        { frame: 90, value: 0.45 },
      ],
    },
    {
      parameterPath: p25.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 45, value: 0.6, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: p25.variationWeight(2, 0),
      keyframes: [
        { frame: 0, value: 0.8 },
        { frame: 30, value: 0.3, easing: 'easeInOut' as const },
        { frame: 60, value: 1.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.8 },
      ],
    },
    {
      parameterPath: p25.transformPostAffine(1, 'b'),
      keyframes: [
        { frame: 0, value: -0.15 },
        { frame: 45, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: -0.15 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 30, value: 0.95, easing: 'easeInOut' as const },
        { frame: 60, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: 'gamma',
      keyframes: [
        { frame: 0, value: 2.0 },
        { frame: 45, value: 1.5, easing: 'easeInOut' as const },
        { frame: 90, value: 2.0 },
      ],
    },
    {
      parameterPath: 'highlightPower',
      keyframes: [
        { frame: 0, value: 0.6 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.6 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 26 — Radiant Symmetry (D4 dihedral symmetry)
// ---------------------------------------------------------------------------

const ex26 = 'example26' as const

const anim26a: AnimationDef = {
  id: 'ex26-camera-orbit',
  name: 'Camera Orbit & Exposure',
  description: 'Camera orbits the symmetric center with exposure pulse',
  exampleId: ex26,
  tracks: [
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 22, value: 0.15, easing: 'easeInOut' as const },
        { frame: 45, value: 0 },
        { frame: 67, value: -0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 22, value: -0.15, easing: 'easeInOut' as const },
        { frame: 45, value: 0 },
        { frame: 67, value: 0.15, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 45, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.25 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 45, value: 0.65, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
  ],
}

const anim26b: AnimationDef = {
  id: 'ex26-color-shift',
  name: 'Color Shift & Vibrancy',
  description: 'Transform colors shift through the palette with vibrancy sweep',
  exampleId: ex26,
  tracks: [
    {
      parameterPath: p26.variationWeight(0, 0),
      keyframes: [
        { frame: 0, value: 0.9 },
        { frame: 30, value: 1.2, easing: 'easeInOut' as const },
        { frame: 60, value: 0.6, easing: 'easeInOut' as const },
        { frame: 90, value: 0.9 },
      ],
    },
    {
      parameterPath: p26.transformColor(0, 'x'),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 45, value: -0.3, easing: 'easeInOut' as const },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: p26.transformColor(0, 'y'),
      keyframes: [
        { frame: 0, value: 0.1 },
        { frame: 45, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.1 },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.6 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.6 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: 0.75, easing: 'easeInOut' as const },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 30, value: 0.5, easing: 'easeInOut' as const },
        { frame: 60, value: 1.6, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: 0.12, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 27 — Post-Spiral Galaxy (postAffine showcase)
// ---------------------------------------------------------------------------

const ex27 = 'example27' as const

const anim27a: AnimationDef = {
  id: 'ex27-spiral-tightness',
  name: 'Spiral Tightness',
  description:
    'postAffine rotation coefficients sweep to change spiral tightness',
  exampleId: ex27,
  tracks: [
    {
      parameterPath: p27.transformPostAffine(0, 'b'),
      keyframes: [
        { frame: 0, value: -0.35 },
        { frame: 45, value: -0.65, easing: 'easeInOut' as const },
        { frame: 90, value: -0.35 },
      ],
    },
    {
      parameterPath: p27.transformPostAffine(0, 'd'),
      keyframes: [
        { frame: 0, value: 0.15 },
        { frame: 45, value: 0.35, easing: 'easeInOut' as const },
        { frame: 90, value: 0.15 },
      ],
    },
    {
      parameterPath: p27.transformPostAffine(1, 'a'),
      keyframes: [
        { frame: 0, value: 0.95 },
        { frame: 30, value: 1.15, easing: 'easeInOut' as const },
        { frame: 60, value: 0.75, easing: 'easeInOut' as const },
        { frame: 90, value: 0.95 },
      ],
    },
    {
      parameterPath: p27.transformPostAffine(1, 'e'),
      keyframes: [
        { frame: 0, value: 1.15 },
        { frame: 30, value: 0.9, easing: 'easeInOut' as const },
        { frame: 60, value: 1.3, easing: 'easeInOut' as const },
        { frame: 90, value: 1.15 },
      ],
    },
    {
      parameterPath: 'exposure',
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 45, value: 0.45, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 30, value: 0.5, easing: 'easeInOut' as const },
        { frame: 60, value: 1.6, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
  ],
}

const anim27b: AnimationDef = {
  id: 'ex27-camera-probability',
  name: 'Camera Pull & Probability Crossfade',
  description: 'Camera zooms out while transform probabilities crossfade',
  exampleId: ex27,
  tracks: [
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 60, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.6 },
      ],
    },
    {
      parameterPath: p27.transformProbability(0),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 30, value: 0.6, easing: 'easeInOut' as const },
        { frame: 60, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: p27.transformProbability(1),
      keyframes: [
        { frame: 0, value: 0.35 },
        { frame: 30, value: 0.15, easing: 'easeInOut' as const },
        { frame: 60, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.35 },
      ],
    },
    {
      parameterPath: p27.transformProbability(2),
      keyframes: [
        { frame: 0, value: 0.25 },
        { frame: 30, value: 0.25 },
        { frame: 60, value: 0.3 },
        { frame: 90, value: 0.25 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 28 — Final Lens (finalTransform showcase)
// ---------------------------------------------------------------------------

const ex28 = 'example28' as const

const anim28a: AnimationDef = {
  id: 'ex28-lens-warp',
  name: 'Lens Warp',
  description:
    'finalTransform coefficients sweep to create dynamic lens warping',
  exampleId: ex28,
  tracks: [
    {
      parameterPath: p28.finalTransformParam('a'),
      keyframes: [
        { frame: 0, value: 0.85 },
        { frame: 30, value: 1.1, easing: 'easeInOut' as const },
        { frame: 60, value: 0.6, easing: 'easeInOut' as const },
        { frame: 90, value: 0.85 },
      ],
    },
    {
      parameterPath: p28.finalTransformParam('b'),
      keyframes: [
        { frame: 0, value: 0.2 },
        { frame: 22, value: 0.5, easing: 'easeInOut' as const },
        { frame: 45, value: -0.1, easing: 'easeInOut' as const },
        { frame: 67, value: -0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.2 },
      ],
    },
    {
      parameterPath: p28.finalTransformParam('d'),
      keyframes: [
        { frame: 0, value: -0.15 },
        { frame: 45, value: 0.3, easing: 'easeInOut' as const },
        { frame: 90, value: -0.15 },
      ],
    },
    {
      parameterPath: p28.finalTransformParam('e'),
      keyframes: [
        { frame: 0, value: 1.1 },
        { frame: 45, value: 0.7, easing: 'easeInOut' as const },
        { frame: 90, value: 1.1 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 30, value: 0.55, easing: 'easeInOut' as const },
        { frame: 60, value: 1.8, easing: 'easeInOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 45, value: -0.2, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
  ],
}

const anim28b: AnimationDef = {
  id: 'ex28-contrast-pan',
  name: 'Contrast Pan & Breathing',
  description: 'Camera pans while contrast and gamma create a breathing effect',
  exampleId: ex28,
  tracks: [
    {
      parameterPath: 'camera.x',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: 0.2, easing: 'easeInOut' as const },
        { frame: 60, value: -0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'camera.y',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 30, value: -0.15, easing: 'easeInOut' as const },
        { frame: 60, value: 0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0 },
      ],
    },
    {
      parameterPath: 'contrast',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 30, value: 1.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.7, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
    {
      parameterPath: 'gamma',
      keyframes: [
        { frame: 0, value: 2.0 },
        { frame: 45, value: 2.8, easing: 'easeInOut' as const },
        { frame: 90, value: 2.0 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Example 29 — Symmetry Cascade (D3 symmetry + postAffine)
// ---------------------------------------------------------------------------

const ex29 = 'example29' as const

const anim29a: AnimationDef = {
  id: 'ex29-kaleidoscope',
  name: 'Kaleidoscope Morph',
  description:
    'Variation weights crossfade to morph the hexagonal kaleidoscope',
  exampleId: ex29,
  tracks: [
    {
      parameterPath: p29.variationWeight(0, 0),
      keyframes: [
        { frame: 0, value: 0.85 },
        { frame: 30, value: 1.2, easing: 'easeInOut' as const },
        { frame: 60, value: 0.5, easing: 'easeInOut' as const },
        { frame: 90, value: 0.85 },
      ],
    },
    {
      parameterPath: p29.variationWeight(0, 1),
      keyframes: [
        { frame: 0, value: 0.3 },
        { frame: 30, value: 0.6, easing: 'easeInOut' as const },
        { frame: 60, value: 0.1, easing: 'easeInOut' as const },
        { frame: 90, value: 0.3 },
      ],
    },
    {
      parameterPath: p29.variationWeight(1, 0),
      keyframes: [
        { frame: 0, value: 0.75 },
        { frame: 45, value: 0.4, easing: 'easeInOut' as const },
        { frame: 90, value: 0.75 },
      ],
    },
    {
      parameterPath: p29.variationWeight(1, 1),
      keyframes: [
        { frame: 0, value: 0.4 },
        { frame: 45, value: 0.8, easing: 'easeInOut' as const },
        { frame: 90, value: 0.4 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 30, value: 0.45, easing: 'easeInOut' as const },
        { frame: 60, value: 1.7, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
  ],
}

const anim29b: AnimationDef = {
  id: 'ex29-post-morph',
  name: 'Petal Reshape & Phase',
  description:
    'postAffine coefficients reshape petals while palette phase shifts',
  exampleId: ex29,
  tracks: [
    {
      parameterPath: p29.transformPostAffine(0, 'e'),
      keyframes: [
        { frame: 0, value: 1.2 },
        { frame: 30, value: 1.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.8, easing: 'easeInOut' as const },
        { frame: 90, value: 1.2 },
      ],
    },
    {
      parameterPath: p29.transformPostAffine(1, 'a'),
      keyframes: [
        { frame: 0, value: 0.7 },
        { frame: 45, value: 1.0, easing: 'easeInOut' as const },
        { frame: 90, value: 0.7 },
      ],
    },
    {
      parameterPath: p29.transformPostAffine(1, 'b'),
      keyframes: [
        { frame: 0, value: -0.2 },
        { frame: 45, value: 0.2, easing: 'easeInOut' as const },
        { frame: 90, value: -0.2 },
      ],
    },
    {
      parameterPath: 'palettePhase',
      keyframes: [
        { frame: 0, value: 0 },
        { frame: 90, value: 0.9, easing: 'easeInOut' as const },
      ],
    },
    {
      parameterPath: 'vibrancy',
      keyframes: [
        { frame: 0, value: 0.65 },
        { frame: 45, value: 0.9, easing: 'easeInOut' as const },
        { frame: 90, value: 0.65 },
      ],
    },
    {
      parameterPath: 'camera.zoom',
      keyframes: [
        { frame: 0, value: 1.0 },
        { frame: 30, value: 1.5, easing: 'easeInOut' as const },
        { frame: 60, value: 0.55, easing: 'easeInOut' as const },
        { frame: 90, value: 1.0 },
      ],
    },
  ],
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const animationDefs: AnimationDef[] = [
  anim1a,
  anim1b,
  anim1c,
  anim1d,
  anim1e,
  anim2a,
  anim2b,
  anim2c,
  anim2d,
  anim3a,
  anim3b,
  anim3c,
  anim4a,
  anim4b,
  anim5a,
  anim5b,
  anim5c,
  anim5d,
  anim6a,
  anim6b,
  anim6c,
  anim8a,
  anim8b,
  anim9a,
  anim9b,
  anim10a,
  anim10b,
  anim11a,
  anim11b,
  anim12a,
  anim12b,
  anim13a,
  anim13b,
  anim13c,
  anim14a,
  anim14b,
  anim14c,
  anim15a,
  anim15b,
  anim15c,
  anim16a,
  anim16b,
  anim16c,
  anim17a,
  anim17b,
  anim17c,
  anim18a,
  anim18b,
  anim18c,
  anim19a,
  anim19b,
  anim19c,
  anim20a,
  anim20b,
  anim20c,
  anim21a,
  anim21b,
  anim21c,
  anim22a,
  anim22b,
  anim22c,
  anim23a,
  anim23b,
  anim24a,
  anim24b,
  anim25a,
  anim25b,
  anim26a,
  anim26b,
  anim27a,
  anim27b,
  anim28a,
  anim28b,
  anim29a,
  anim29b,
]

/** Group animations by their example flame */
export function getAnimationsByExample(): Map<string, AnimationDef[]> {
  const map = new Map<string, AnimationDef[]>()
  for (const anim of animationDefs) {
    const list = map.get(anim.exampleId)
    if (list) {
      list.push(anim)
    } else {
      map.set(anim.exampleId, [anim])
    }
  }
  return map
}
