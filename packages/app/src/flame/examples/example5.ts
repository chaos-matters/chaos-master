import type { FlameFunction } from '../flameFunction'

export const example5: FlameFunction[] = [
  {
    probability: 1,
    preAffine: {
      c: -0.23227298567827398,
      f: 0.19281720274709663,
      a: 0.5594068988147309,
      b: -0.20429606264744424,
      d: 0.20429606264744424,
      e: 0.5594068988147309,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    color: { x: -0.192324205046832, y: -0.06138839974585364 },
    variations: [{ type: 'linear', weight: 1 }],
  },
  {
    probability: 1,
    color: { x: 0.20365052173511372, y: -0.007286952126410687 },
    preAffine: {
      c: 0.7814282759105398,
      f: 0.2807611497121449,
      a: 0.7670667933719861,
      b: 0,
      d: 0,
      e: 0.7670667933719861,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    variations: [{ type: 'linear', weight: 1 }],
  },
  {
    probability: 1,
    color: { x: -0.16144200626959246, y: 0.06739811912225704 },
    preAffine: {
      c: 0.28882925896559963,
      f: -0.8725110020244996,
      a: 0.4104869572882953,
      b: 0.17515743500649564,
      d: -0.17515743500649564,
      e: 0.4104869572882953,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    variations: [{ type: 'linear', weight: 1 }],
  },
  {
    probability: 0.956,
    color: { x: 0.051724137931034475, y: -0.12539184952978055 },
    preAffine: {
      c: 0.4249390456287006,
      f: -0.24381748519679558,
      a: 0.38728709650006676,
      b: -0.4243016692854076,
      d: -0.1104290666706863,
      e: 0.37060026460901013,
    },
    postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
    variations: [
      { type: 'juliaN', params: { power: 8, dist: 6.82 }, weight: 0.706 },
    ],
  },
]
