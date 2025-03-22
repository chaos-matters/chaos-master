import { Infer } from 'typegpu/data'
import { ParametricVariation } from './types'
import {
  linear,
  sinusoidal,
  spherical,
  swirl,
  randomDisk,
  gaussian,
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
  fisheye,
  eyefish,
  exponential,
  power,
  cosine,
  bubble,
  cylinder,
  noise,
  blurVar,
  waves,
  rings,
  fan,
  popcorn,
} from './simpleVariations'
import { grid } from './parametric/grid'
import { pie } from './parametric/pie'
import { blob } from './parametric/blob'
import { pdjVar } from './parametric/pdj'
import { fan2 } from './parametric/fan2'
import { rings2 } from './parametric/rings2'
import { perspective } from './parametric/perspective'
import { juliaN } from './parametric/juliaN'
import { juliaScope } from './parametric/juliaScope'
import { radialBlurVar } from './parametric/radialBlur'

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
  rings2,
  bubble,
  cylinder,
  perspective,
  noise,
  juliaN,
  juliaScope,
  blurVar,
  radialBlurVar,
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
