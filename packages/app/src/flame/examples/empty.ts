import type { FlameFunction } from '../flameFunction'

export const empty: FlameFunction[] = [
  {
    probability: 1,
    preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 },
    color: { x: 0, y: 0 },
    variations: [{ type: 'linear', weight: 1 }],
  },
]
