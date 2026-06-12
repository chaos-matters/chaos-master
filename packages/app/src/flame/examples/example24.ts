import { defineExample, tid, vid } from './util'

/**
 * Crystal Lattice — ngonVar polygons tessellate across a hexagonal grid,
 * pulled into 3D perspective depth planes. Rings2 concentric circles
 * overlay geometric mandalas while linear power distortion stretches
 * the structure into crystalline fractal forms.
 */
export const example24 = defineExample({
  version: '1.0',
  metadata: {
    author: 'unknown',
    name: 'Crystal Lattice',
    description:
      'ngonVar polygons tessellate across a hexagonal grid, pulled into 3D perspective depth planes. Rings2 concentric circles overlay geometric mandalas while linear power distortion stretches the structure into crystalline fractal forms.',
  },
  renderSettings: {
    exposure: 0.26,
    skipIters: 20,
    drawMode: 'light',
    vibrancy: 0.6,
    contrast: 1.1,
    highlightPower: 0.5,
    camera: {
      zoom: 1.05,
      position: [0, 0],
    },
  },
  transforms: {
    // T0: Hexes + ngonVar — hexagonal lattice with polygon crystals
    [tid('a1b2c3d4_e5f6_019a_7890_abcdef123456')]: {
      probability: 0.5,
      preAffine: { a: 0.55, b: 0, c: 0, d: 0, e: 0.55, f: 0 },
      postAffine: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
      color: { x: 0.25, y: 0.05 },
      variations: {
        [vid('b2c3d4e5_f6a7_019b_8901_bcdef1234567')]: {
          type: 'hexesVar',
          weight: 0.75,
          params: { cellsize: 0.14, power: 1.1, rotate: 0.15, scale: 0.7 },
        },
        [vid('c3d4e5f6_a7b8_019c_9012_cdef12345678')]: {
          type: 'ngonVar',
          weight: 0.5,
          params: { power: 2.5, sides: 5, corners: 3, circle: 3 },
        },
      },
    },
    // T1: Rings2 + perspective — concentric circles in perspective depth
    [tid('d4e5f6a7_b8c9_019d_0123_def123456789')]: {
      probability: 0.4,
      preAffine: { a: 0.45, b: 0.12, c: 0, d: -0.12, e: 0.45, f: 0 },
      postAffine: { a: 0.8, b: 0, c: 0, d: 0, e: 0.8, f: 0 },
      color: { x: -0.15, y: -0.1 },
      variations: {
        [vid('e5f6a7b8_c9d0_019e_1234_ef1234567890')]: {
          type: 'rings2Var',
          weight: 1,
          params: { val: 5.5 },
        },
        [vid('f6a7b8c9_d0e1_019f_2345_01234567890a')]: {
          type: 'perspectiveVar',
          weight: 0.35,
          params: { angle: 0.6, dist: 1.2 },
        },
      },
    },
    // T2: LinearTVar + spherical — power-distorted linear rays with spherical projection
    [tid('a7b8c9d0_e1f2_019g_3456_1234567890ab')]: {
      probability: 0.3,
      preAffine: { a: 0.3, b: 0, c: 0, d: 0, e: 0.3, f: 0 },
      postAffine: { a: 0.65, b: 0, c: 0, d: 0, e: 0.65, f: 0 },
      color: { x: -0.05, y: -0.25 },
      variations: {
        [vid('b8c9d0e1_f2a3_019h_4567_234567890abc')]: {
          type: 'linearTVar',
          weight: 0.8,
          params: { powX: 0.8, powY: 1.3 },
        },
        [vid('c9d0e1f2_a3b4_019i_5678_34567890abcd')]: {
          type: 'sphericalVar',
          weight: 0.3,
        },
      },
    },
  },
})
