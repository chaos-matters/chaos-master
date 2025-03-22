import type { FlameFunction } from '../flameFunction'

export const ngonFlame: FlameFunction[] = [
  {
    probability: 0.2,
    preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: { x: 0.8, y: 0.3 },
    variations: [
      {
        type: 'ngonVar',
        weight: 2,
        params: { power: 2, sides: 4, corners: 4, circle: 1 },
      },
    ],
  },
]
