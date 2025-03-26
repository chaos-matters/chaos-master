import type { FlameFunction } from '../flameFunction'

export const example1: FlameFunction[] = [
  {
    probability: 0.4,
    preAffine: { a: 0.8, b: 0, c: 0.5, d: 0, e: 0.6, f: 0 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: { x: 0.1, y: 0.25 },
    variations: [{ type: 'linear', weight: 1 }],
  },
  {
    probability: 0.3,
    preAffine: { a: 0.7, b: 0.3, c: 0.1, d: 0, e: 0.6, f: 0.5 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: { x: -0.3, y: 0.1 },
    variations: [
      { type: 'linear', weight: 0.4 },
      { type: 'swirl', weight: 0.5 },
      { type: 'popcorn', weight: 0.1 },
    ],
  },
  {
    probability: 0.2,
    preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
    postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
    color: { x: 0, y: -0.3 },
    variations: [
      {
        type: 'pie',
        weight: 0.95,
        params: { rotation: 0, slices: 5, thickness: 0.5 },
      },
      { type: 'gaussian', weight: 0.05 },
    ],
  },
  {
    probability: 0.1,
    preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: { x: 1, y: 0 },
    variations: [{ type: 'sinusoidal', weight: 1 }],
  },
]
