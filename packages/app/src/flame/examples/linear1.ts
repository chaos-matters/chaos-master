import { defineExample, tid, vid } from './util'

export const linear1 = defineExample({
  renderSettings: {
    exposure: 1,
    skipIters: 20,
    drawMode: 'light',
    camera: {
      zoom: 0.9250189643808657,
      position: [2.2206582672782824, -1.3296191881496164],
    },
  },
  transforms: {
    [tid('5d4334f1_2d86_4790_b1f7_0959ce03486d')]: {
      probability: 1,
      preAffine: {
        a: 1.0540204340811536,
        b: 0.40927217400008875,
        c: 0.41044109612070767,
        d: -0.40927217400008875,
        e: 1.0540204340811536,
        f: -0.6449788653325407,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.24059401492657634, y: -0.1892117532217128 },
      variations: {
        [vid('79b89e92_15a5_478f_ae85_dcd22856f9ea')]: {
          type: 'linear',
          weight: 0.95,
        },
      },
    },
    [tid('42316a5a_d01b_4577_8dae_8107f2eecded')]: {
      probability: 0.293,
      preAffine: {
        a: 1.6053602749419031,
        b: 0.7684904295453283,
        c: 1.9489456440401987,
        d: -0.3204383880132562,
        e: 0.43973527404023566,
        f: 0.17311140256688978,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.031047370799169666, y: 0.0937664949455789 },
      variations: {
        [vid('c07f1b17_9072_461e_9dc8_c5ceaaabf71d')]: {
          type: 'linear',
          weight: 0.566,
        },
      },
    },
    [tid('2f4887e6_852d_4b71_b4ac_0c9be63d7870')]: {
      probability: 0.293,
      preAffine: {
        a: 1.6053602749419031,
        b: 0.7684904295453283,
        c: 1.9489456440401987,
        d: -0.3204383880132562,
        e: 0.43973527404023566,
        f: 0.17311140256688978,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: -0.031047370799169666, y: 0.0937664949455789 },
      variations: {
        [vid('b2c15c46_4975_4fc6_9571_52189459f503')]: {
          type: 'linear',
          weight: 0.566,
        },
      },
    },
    [tid('4d691d7e_bcdd_4275_b743_8a9f7ac7db33')]: {
      probability: 0.293,
      preAffine: {
        a: 1.6053602749419031,
        b: 0.7684904295453283,
        c: 1.9489456440401987,
        d: -0.3204383880132562,
        e: 0.43973527404023566,
        f: 0.17311140256688978,
      },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.007662306620185175, y: 0.12602455946170793 },
      variations: {
        [vid('30af6845_b157_4a01_98de_3f1ee9f93c44')]: {
          type: 'linear',
          weight: 0.566,
        },
      },
    },
  },
})
