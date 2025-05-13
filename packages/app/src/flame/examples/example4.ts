import type { FlameFunction } from '../flameFunction'

export const example4: FlameFunction[] = [
  {
    probability: 1,
    preAffine: {
      c: -0.724457132039856,
      f: 0.4972994691110664,
      a: 0.4089259453553665,
      b: -0.28877227665901745,
      d: 0.28877227665901745,
      e: 0.4089259453553665,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: { x: -0.192324205046832, y: -0.06138839974585364 },
    variations: [{ type: 'linear', weight: 1 }],
  },
  {
    probability: 1,
    color: { x: 0.20365052173511372, y: -0.007286952126410687 },
    preAffine: {
      c: 0.5383920130767872,
      f: 0.12836048618282553,
      a: 0.5988955229607208,
      b: 0.06236563566565948,
      d: -0.06236563566565948,
      e: 0.5988955229607208,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    variations: [{ type: 'linear', weight: 1 }],
  },
  {
    probability: 1,
    color: { x: 0, y: 0 },
    preAffine: {
      c: -0.35877728012122084,
      f: -0.5953305678377026,
      a: 0.472856414160609,
      b: 0.24463308792368213,
      d: -0.24463308792368213,
      e: 0.472856414160609,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    variations: [{ type: 'linear', weight: 1 }],
  },
]
