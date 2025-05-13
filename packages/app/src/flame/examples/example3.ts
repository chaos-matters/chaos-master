import type { FlameFunction } from '../flameFunction'

export const example3: FlameFunction[] = [
  {
    probability: 0.1,
    preAffine: {
      a: 1,
      b: 0,
      c: -0.0015204710978657804,
      d: 0,
      e: 1,
      f: -0.0007397004927711878,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: -1, f: 0 },
    color: { x: 0, y: 0 },
    variations: [{ type: 'juliaN', params: { power: 1, dist: 2 }, weight: 1 }],
  },
  {
    probability: 0.1,
    color: { x: 0, y: 0 },
    preAffine: {
      a: 1,
      b: 0,
      c: 0.357993699581687,
      d: 0,
      e: 1,
      f: -0.01634648933264489,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    variations: [{ type: 'eyefish', weight: 1 }],
  },
  {
    probability: 0.1,
    color: { x: 0.009677435415016582, y: -0.2998438714461047 },
    preAffine: {
      c: -0.2341240798160174,
      f: 0.0025485527424406185,
      a: 0.8772614878717728,
      b: -0.0034839054925084626,
      d: 0,
      e: 1,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    variations: [{ type: 'linear', weight: 1 }],
  },
]
