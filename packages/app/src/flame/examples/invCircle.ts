import { defineExample } from './util'

// export const invCircleEx = defineExample({
//   metadata: {
//     author: 'unknown',
//   },
//   renderSettings: {
//     exposure: 0.377,
//     skipIters: 20,
//     drawMode: 'light',
//     colorInitMode: 'colorInitPosition',
//     backgroundColor: [0, 0, 0],
//     camera: {
//       zoom: 0.5211328837814934,
//       position: [1.0437967777252197, 0.03468599170446396],
//     },
//   },
//   transforms: {
//     d2523f69_dd2d_49cb_b14f_d9448e0bfb31: {
//       probability: 1,
//       preAffine: {
//         a: 1,
//         b: 0,
//         c: -0.00972411036491394,
//         d: 0,
//         e: 1,
//         f: -0.03695952892303467,
//       },
//       postAffine: {
//         a: 1,
//         b: 0,
//         c: 0,
//         d: 0,
//         e: 1,
//         f: 0,
//       },
//       color: {
//         x: 0.18155623972415924,
//         y: 0.01655333675444126,
//       },
//       variations: {
//         bc571c35_0b03_4865_a765_d00cd71031a6: {
//           type: 'invCircle',
//           weight: 1,
//           params: {
//             radius: 1,
//             a: 0,
//             b: 0,
//             restrictNext: 0,
//             restricted: 1,
//           },
//         },
//       },
//     },
//     f881eb22_51d8_4076_859c_2a06d35d0da6: {
//       probability: 1,
//       color: {
//         x: -0.20879751443862915,
//         y: -0.08920476585626602,
//       },
//       preAffine: {
//         a: 1,
//         b: 0,
//         c: -0.010370731353759766,
//         d: 0,
//         e: 1,
//         f: -0.02636958658695221,
//       },
//       postAffine: {
//         a: 1,
//         b: 0,
//         c: 0,
//         d: 0,
//         e: 1,
//         f: 0,
//       },
//       variations: {
//         '025ea6fd_a2fa_4d4e_9a35_7dce33da0a53': {
//           type: 'rectanglesVar',
//           weight: 1,
//           params: {
//             x: 1,
//             y: 1,
//           },
//         },
//       },
//     },
//   },
// })
//
// export const invCircleTangent = defineExample({
//   metadata: { author: 'unknown' },
//   renderSettings: {
//     exposure: 1.081,
//     skipIters: 1,
//     drawMode: 'light',
//     colorInitMode: 'colorInitPosition',
//     backgroundColor: [0, 0, 0],
//     camera: {
//       zoom: 0.5296719699821935,
//       position: [1.0272960662841797, 0.035816971212625504],
//     },
//   },
//   transforms: {
//     ad6e4019_30fa_4e55_8806_5b15a5ad3de7: {
//       probability: 0.2,
//       preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       color: { x: -0.21849212050437927, y: -0.055318549275398254 },
//       variations: {
//         f4bd8d90_690a_4378_9bdb_a9542c69ede2: {
//           type: 'invCircle',
//           weight: 1,
//           params: { radius: 0.6, a: 1.6, b: 0 },
//         },
//       },
//     },
//     '969939cb_f266_4b49_aff8_59f00f45040b': {
//       probability: 0.2,
//       preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       color: { x: -0.009852036833763123, y: 0.22583946585655212 },
//       variations: {
//         f5a402db_3eee_46b4_b8be_b379d5513afd: {
//           type: 'invCircle',
//           weight: 1,
//           params: { radius: 1, a: 0, b: 0 },
//         },
//       },
//     },
//     '6ac1e8ed_9311_4d95_bc4a_8ac2a86447b8': {
//       probability: 0.2,
//       preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       color: { x: -0.38098853826522827, y: 0.0391426607966423 },
//       variations: {
//         '709e0303_c73f_43d0_9406_e24fe4c888d9': {
//           type: 'invCircle',
//           weight: 1,
//           params: { radius: 0.6, a: -1.6, b: 0 },
//         },
//       },
//     },
//     '95e7a39b_6d0c_4e8b_bbfd_9500f99ed6e3': {
//       probability: 0.2,
//       preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       color: { x: -0.21868860721588135, y: 0.10852532833814621 },
//       variations: {
//         '9500488b_9603_4e62_88b7_c5d078b2d85d': {
//           type: 'invCircle',
//           weight: 1,
//           params: { radius: 0.6, a: 0, b: 1.6 },
//         },
//       },
//     },
//     '177ec5dd_a0c3_459c_bb74_428a1922d8eb': {
//       probability: 1,
//       preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
//       color: { x: 0.24149851500988007, y: 0.1970379650592804 },
//       variations: {
//         bfc50fb7_c8fa_4817_8887_f99365e5e140: {
//           type: 'invCircle',
//           weight: 1,
//           params: { radius: 0.6, a: 0, b: -1.6, restricted: 0 },
//         },
//       },
//     },
//   },
// })
export const gridTestInvCircle = defineExample({
  metadata: { author: 'unknown' },
  renderSettings: {
    exposure: 0.811,
    skipIters: 20,
    drawMode: 'light',
    colorInitMode: 'colorInitPosition',
    backgroundColor: [0, 0, 0],
    camera: {
      zoom: 0.2530227887159189,
      position: [1.67516028881073, 0.04361298680305481],
    },
  },
  transforms: {
    d2523f69_dd2d_49cb_b14f_d9448e0bfb31: {
      probability: 1,
      preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.18155623972415924, y: 0.01655333675444126 },
      variations: {
        bc571c35_0b03_4865_a765_d00cd71031a6: {
          type: 'invCircle',
          params: { radius: 1, cx: 0, cy: 0, restricted: 1 },
          weight: 1,
        },
      },
    },
    fca7314a_7bce_4dd2_a201_780dc09ce3bc: {
      probability: 1,
      color: { x: -0.2461596578359604, y: -0.16179783642292023 },
      preAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      variations: {
        c32ca0f0_9ab5_40fc_b3e6_5bdcbb97f189: {
          type: 'grid',
          weight: 1,
          params: {
            divisions: 10,
            size: 1,
            jitterNearIntersectionsDistance: 0.002,
          },
        },
      },
    },
  },
})
