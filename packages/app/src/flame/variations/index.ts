import {
  bent,
  cosine,
  diamond,
  disc,
  exVar,
  exponential,
  eyefish,
  fisheye,
  gaussian,
  handkerchief,
  heart,
  horseshoe,
  hyperbolic,
  julia,
  linear,
  polar,
  power,
  randomDisk,
  sinusoidal,
  spherical,
  spiral,
  swirl,
} from './simpleVariations'
import { grid } from './parametric/grid'
import { pie } from './parametric/pie'
import { blob } from './parametric/blob'
import { pdjVar } from './parametric/pdj'
import { waves, rings, fan, popcorn } from './dependentVariations'
import { fan2 } from './parametric/fan2'
import { Infer } from 'typegpu/data'
import { ParametricVariation } from './types'

export const transformVariations = {
  linear,
  sinusoidal,
  spherical,
  swirl,
  popcorn,
  pie,
  randomDisk,
  gaussian,
  grid,
  horseshoe,
  polar,
  handkerchief,
  heart,
  disc,
  spiral,
  hyperbolic,
  diamond,
  exVar,
  julia,
  bent,
  waves,
  fisheye,
  eyefish,
  exponential,
  power,
  cosine,
  rings,
  fan,
  blob,
  pdjVar,
  fan2,
}

export type TransformVariation = keyof typeof transformVariations
const variationTypes = Object.keys(transformVariations)

export function isVariationType(
  maybeType: string,
): maybeType is TransformVariation {
  return variationTypes.includes(maybeType)
}

export type TransformVariationDescriptor = {
  [K in TransformVariation]: (typeof transformVariations)[K] extends ParametricVariation<
    infer P
  >
    ? { type: K; weight: number; params: Infer<P> }
    : { type: K; weight: number }
}[TransformVariation]
