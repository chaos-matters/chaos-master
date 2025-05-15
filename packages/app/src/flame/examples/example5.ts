import { tid, vid } from './util'
import type { FlameDescriptor } from '../transformFunction'

export const example5: FlameDescriptor = {
  renderSettings: {
    exposure: 0.25,
    skipIters: 20,
    drawMode: 'light',
  },
  transforms: {
    [tid('bec1f24c_4484_4d8e_b806_bc70b85dcc50')]: {
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
      variations: {
        [vid('97de1881_f3e5_4aef_a024_9f743da0c15b')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    [tid('7ce78372_ac3f_4789_b788_216398e9eaf2')]: {
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
      variations: {
        [vid('b1d6773c_8abe_4ddb_8f0b_f5cd8262ab7d')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    [tid('f9b419f1_17ab_45c5_bad1_5484dd7ceb7b')]: {
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
      variations: {
        [vid('085aed69_bbef_4113_95e5_002f5b536de7')]: {
          type: 'linear',
          weight: 1,
        },
      },
    },
    [tid('e9c75ab0_3c5d_40cd_8e47_21acbaca2bf3')]: {
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
      variations: {
        [vid('a52476d5_bca8_4f54_8a1c_d1856f5e8cdb')]: {
          type: 'juliaN',
          params: { power: 8, dist: 6.82 },
          weight: 0.706,
        },
      },
    },
  },
}
