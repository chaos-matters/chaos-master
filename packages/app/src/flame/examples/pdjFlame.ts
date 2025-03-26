import type { FlameFunction } from '../flameFunction'

export const pdjFlame: FlameFunction[] = [
  {
    probability: 0.2,
    preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
    postAffine: { a: 0, b: -1, c: 0, d: 1, e: 0, f: 0 },
    color: { x: 0, y: -0.3 },
    variations: [
      {
        type: 'pdjVar',
        weight: 0.95,
        params: { a: -5, b: 5, c: 5, d: 10 },
      },
    ],
  },
]
