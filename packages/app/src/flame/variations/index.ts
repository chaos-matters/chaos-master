import { blob } from './parametric/blob'
import { curlVar } from './parametric/curl'
import { fan2 } from './parametric/fan2'
import { grid } from './parametric/grid'
import { juliaN } from './parametric/juliaN'
import { juliaScope } from './parametric/juliaScope'
import { ngonVar } from './parametric/ngon'
import { pdjVar } from './parametric/pdj'
import { perspective } from './parametric/perspective'
import { pie } from './parametric/pie'
import { radialBlurVar } from './parametric/radialBlur'
import { rectanglesVar } from './parametric/rectangles'
import { rings2 } from './parametric/rings2'
import {
  archVar,
  bent,
  bladeVar,
  blurVar,
  bubble,
  cosine,
  crossVar,
  cylinder,
  diamond,
  disc,
  exponential,
  exVar,
  eyefish,
  fan,
  fisheye,
  gaussian,
  handkerchief,
  heart,
  horseshoe,
  hyperbolic,
  julia,
  linear,
  noise,
  polar,
  popcorn,
  power,
  randomDisk,
  raysVar,
  rings,
  secantVar,
  sinusoidal,
  spherical,
  spiral,
  squareVar,
  swirl,
  tangentVar,
  twintrianVar,
  waves,
} from './simpleVariations'
import type { Infer } from 'typegpu/data'
import type { ParametricVariation } from './types'

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
  ngonVar,
  curlVar,
  rectanglesVar,
  archVar,
  tangentVar,
  squareVar,
  raysVar,
  bladeVar,
  secantVar,
  twintrianVar,
  crossVar,
}

export type TransformVariation = keyof typeof transformVariations
export const variationTypes = Object.keys(transformVariations)

export function isParametric(
  name: TransformVariation,
): name is ParametricVariationDescriptor['type'] {
  return transformVariations[name].type === 'parametric'
}

export function isParametricType(
  v: TransformVariationDescriptor,
): v is Extract<TransformVariationDescriptor, { params: unknown }> {
  return 'params' in v
}
export function isVariationType(
  maybeType: string,
): maybeType is TransformVariation {
  return variationTypes.includes(maybeType)
}

export type ParametricTransformParams<T extends TransformVariation> =
  (typeof transformVariations)[T] extends ParametricVariation<infer P>
    ? Infer<P>
    : never

export type TransformVariationDescriptor = {
  [K in TransformVariation]: (typeof transformVariations)[K] extends ParametricVariation<
    infer P
  >
    ? { type: K; weight: number; params: Infer<P> }
    : { type: K; weight: number }
}[TransformVariation]

export type ParametricVariationDescriptor = {
  [K in TransformVariation]: (typeof transformVariations)[K] extends ParametricVariation<
    infer P
  >
    ? { type: K; weight: number; params: Infer<P> }
    : never
}[TransformVariation]
