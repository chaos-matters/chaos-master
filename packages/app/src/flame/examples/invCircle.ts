import { defineExample } from './util'

export const invCircleEx = defineExample({
  metadata: {
    author: 'unknown',
  },
  renderSettings: {
    exposure: 0.377,
    skipIters: 20,
    drawMode: 'light',
    colorInitMode: 'colorInitPosition',
    backgroundColor: [0, 0, 0],
    camera: {
      zoom: 0.5211328837814934,
      position: [1.0437967777252197, 0.03468599170446396],
    },
  },
  transforms: {
    d2523f69_dd2d_49cb_b14f_d9448e0bfb31: {
      probability: 1,
      preAffine: {
        a: 1,
        b: 0,
        c: -0.00972411036491394,
        d: 0,
        e: 1,
        f: -0.03695952892303467,
      },
      postAffine: {
        a: 1,
        b: 0,
        c: 0,
        d: 0,
        e: 1,
        f: 0,
      },
      color: {
        x: 0.18155623972415924,
        y: 0.01655333675444126,
      },
      variations: {
        bc571c35_0b03_4865_a765_d00cd71031a6: {
          type: 'invCircle',
          weight: 1,
          params: {
            radius: 1,
            a: 0,
            b: 0,
          },
        },
      },
    },
    f881eb22_51d8_4076_859c_2a06d35d0da6: {
      probability: 1,
      color: {
        x: -0.20879751443862915,
        y: -0.08920476585626602,
      },
      preAffine: {
        a: 1,
        b: 0,
        c: -0.010370731353759766,
        d: 0,
        e: 1,
        f: -0.02636958658695221,
      },
      postAffine: {
        a: 1,
        b: 0,
        c: 0,
        d: 0,
        e: 1,
        f: 0,
      },
      variations: {
        '025ea6fd_a2fa_4d4e_9a35_7dce33da0a53': {
          type: 'rectanglesVar',
          weight: 1,
          params: {
            x: 1,
            y: 1,
          },
        },
      },
    },
  },
})
