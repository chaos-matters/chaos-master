import type { FlameDescriptor } from '../flameFunction'

export const empty: FlameDescriptor = {
  renderSettings: {
    quality: 1,
    exposure: 0.25,
    skipIters: 20,
  },
  transforms: [
    {
      probability: 1,
      preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0, y: 0 },
      variations: [{ type: 'linear', weight: 1 }],
    },
  ],
}
