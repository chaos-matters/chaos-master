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
  archVar,
  tangentVar,
  squareVar,
  raysVar,
  bladeVar,
  secantVar,
  twintrianVar,
  crossVar,
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
import { ngonVar } from './parametric/ngon'
import { curlVar } from './parametric/curl'
import { rectanglesVar } from './parametric/rectangles'

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

export function isParametric(name: TransformVariation) {
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
