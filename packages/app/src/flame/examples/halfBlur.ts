import { latestSchemaVersion } from '../schema/flameSchema'
import { defineExample, tid, vid } from './util'

export const halfBlurEx1 = defineExample({
  version: latestSchemaVersion,
  metadata: { author: 'unknown' },
  renderSettings: {
    exposure: 0.925,
    skipIters: 1,
    drawMode: 'light',
    colorInitMode: 'colorInitZero',
    camera: {
      zoom: 0.3037948920450817,
      position: [-0.0012674033641815186, 1.4754579067230225],
    },
  },
  transforms: {
    [tid('55d4c43f_14b8_4554_a9d1_a94eda857811')]: {
      probability: 1,
      preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.40025249123573303, y: 0.3257576823234558 },
      variations: {
        [vid('44890d73_369c_4ed1_a1f5_1d7adf71a8ff')]: {
          type: 'cannabisBlur',
          weight: 1,
          params: { fill: 0.6 },
        },
      },
    },
  },
})
