import type { FlameFunction } from '../flameFunction'

export const fan2Flame: FlameFunction[] = [
  {
    probability: 0.2,
    preAffine: { a: 0.6, b: 0.5, c: -0.5, d: 0, e: 0.5, f: -0.5 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: { x: 0.8, y: 0.3 },
    variations: [
      {
        type: 'fan2',
        weight: 2.95,
        params: { x: 25, y: 5 },
      },
    ],
  },
]
