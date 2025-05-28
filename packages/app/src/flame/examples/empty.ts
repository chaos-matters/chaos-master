import { tid, vid } from './util'
import type { FlameDescriptor } from '../transformFunction'

export const empty: FlameDescriptor = {
  renderSettings: {
    exposure: 0.25,
    skipIters: 20,
    drawMode: 'light',
    backgroundColor: [0, 0, 0],
  },
  transforms: {
    [tid('d2523f69_dd2d_49cb_b14f_d9448e0bfb31')]: {
      probability: 1,
      preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0, y: 0 },
      variations: {
        [vid('bc571c35_0b03_4865_a765_d00cd71031a6')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
  },
}
