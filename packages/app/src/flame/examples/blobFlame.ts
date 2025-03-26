import type { FlameFunction } from '../flameFunction'

export const blobFlame: FlameFunction[] = [
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
    probability: 0.2,
    preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
    postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
    color: { x: 0, y: -0.3 },
    variations: [
      {
        type: 'blob',
        weight: 0.95,
        params: { low: -5, high: 5, waves: 5 },
      },
    ],
  },
]
