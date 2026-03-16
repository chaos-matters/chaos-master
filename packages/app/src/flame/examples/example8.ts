import { defineExample } from './util'

export const example8 = defineExample({
  version: '1.0',
  metadata: { author: 'unknown' },
  renderSettings: {
    exposure: 0.7,
    skipIters: 9,
    drawMode: 'light',
    colorInitMode: 'colorInitZero',
    backgroundColor: [0, 0, 0],
    camera: {
      zoom: 0.5601340493210198,
      position: [0.07790163159370422, 0.03288983553647995],
    },
  },
  transforms: {
    d2523f69_dd2d_49cb_b14f_d9448e0bfb31: {
      probability: 1,
      preAffine: {
        c: 0,
        f: 0,
        a: 0.7898641581301579,
        b: -0.48041598787693446,
        d: 0.48041598787693446,
        e: 0.7898641581301579,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.17325051128864288, y: -0.15132109820842743 },
      variations: {
        bc571c35_0b03_4865_a765_d00cd71031a6: {
          type: 'handkerchief',
          weight: 0.832,
        },
        f4cc71a4_265f_4e8b_b213_4c515c0af6db: { type: 'bubble', weight: 0.175 },
      },
    },
    ___296f0c33_702b_4b0f_b03e_ca9e52521519: {
      probability: 1,
      color: { x: -0.13267171382904053, y: 0.20795078575611115 },
      preAffine: {
        c: -0.007231641560792923,
        f: -1.110204815864563,
        a: 1.1733442847170854,
        b: 0.013805359003249187,
        d: -0.013805359003249187,
        e: 1.1733442847170854,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: {
        '02a7d401_9691_404c_be9c_a816efefcb8f': { type: 'julia', weight: 1 },
      },
    },
  },
})
