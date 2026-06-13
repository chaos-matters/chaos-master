import { defineExample3D, tid, vid } from './util'

// 3D counterpart of `initExample`: a single identity transform with a plain
// `linear3D` variation, so switching a fresh project into 3D starts from a
// clean slate rather than a fully-authored preset.
const IDENTITY_AFFINE_3D = {
  a: 1,
  b: 0,
  c: 0,
  d: 0,
  e: 0,
  f: 1,
  g: 0,
  h: 0,
  i: 0,
  j: 0,
  k: 1,
  l: 0,
}

export const initExample3D = defineExample3D({
  renderSettings: {
    exposure: 0.25,
    skipIters: 1,
    drawMode: 'light',
    colorInitMode: 'colorInitPosition',
    pointInitMode: 'pointInitUnitBall',
    backgroundColor: [0, 0, 0],
    dimensions: 3,
    camera: { zoom: 1, position: [0, 0] },
    camera3D: {
      theta: 0,
      phi: Math.PI / 2,
      radius: 5,
      target: [0, 0, 0],
      fov: 60,
    },
  },
  transforms: {
    [tid('init3d_0000_4000_8000_000000000001')]: {
      probability: 1,
      preAffine: IDENTITY_AFFINE_3D,
      postAffine: IDENTITY_AFFINE_3D,
      color: { x: 0, y: 0 },
      variations: {
        [vid('init3d_0000_4000_8000_000000000002')]: {
          type: 'linear3D',
          weight: 1,
        },
      },
    },
  },
})
