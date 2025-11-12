import { f32, vec2f } from 'typegpu/data'
import {
  atan2,
  cos,
  cosh,
  dot,
  exp,
  length,
  log,
  pow,
  select,
  sin,
  sinh,
  sqrt,
  tan,
} from 'typegpu/std'
import { random, randomUnitDisk } from '@/shaders/random'
import { PI } from '../../constants'
import { simpleVariation } from './types'

export const waves = simpleVariation('waves', (pos, varInfo) => {
  'use gpu'
  const T = varInfo.affineCoefs
  const xSinArg = pos.y / (T.c * T.c)
  const ySinArg = pos.x / (T.f * T.f)
  const delta = vec2f(T.b * sin(xSinArg), T.e * sin(ySinArg))
  return pos.add(delta)
})

export const popcorn = simpleVariation('popcorn', (pos, varInfo) => {
  'use gpu'
  const T = varInfo.affineCoefs
  const delta = vec2f(T.c * sin(tan(3 * pos.y)), T.f * sin(tan(3 * pos.x)))
  return pos.add(delta)
})

export const rings = simpleVariation('rings', (pos, varInfo) => {
  'use gpu'
  const T = varInfo.affineCoefs
  const c2 = T.c * T.c
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  const factor = ((r + c2) % (2 * c2)) - c2 + r * (1 - c2)
  return vec2f(cos(theta), sin(theta)).mul(factor)
})

export const fan = simpleVariation('fan', (pos, varInfo) => {
  'use gpu'
  const T = varInfo.affineCoefs
  const t = PI.$ * T.c * T.c
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)

  const thalf = t / 2
  const trueAngle = theta - thalf
  const falseAngle = theta + thalf
  const modCond = (theta + T.f) % t
  const angle = select(falseAngle, trueAngle, modCond > thalf)
  return vec2f(cos(angle), sin(angle)).mul(r)
})

export const linear = simpleVariation('linear', (pos, _varInfo) => {
  'use gpu'
  return pos
})

export const randomDisk = simpleVariation('randomDisk', (_pos, _varInfo) => {
  'use gpu'
  return randomUnitDisk()
})

export const gaussian = simpleVariation('gaussian', (_pos, _varInfo) => {
  'use gpu'
  const r = random() + random() + random() + random() - 2
  const theta = random() * 2 * PI.$
  return vec2f(cos(theta), sin(theta)).mul(r)
})

export const sinusoidal = simpleVariation('sinusoidal', (pos, _varInfo) => {
  'use gpu'
  return vec2f(sin(pos.x), sin(pos.y))
})

export const spherical = simpleVariation('spherical', (pos, _varInfo) => {
  'use gpu'
  const r2 = dot(pos, pos)
  return pos.div(r2)
})

export const swirl = simpleVariation('swirl', (pos, _varInfo) => {
  'use gpu'
  const r2 = dot(pos, pos)
  const s2 = sin(r2)
  const c2 = cos(r2)
  return vec2f(pos.x * s2 - pos.y * c2, pos.x * c2 + pos.y * s2)
})

export const horseshoe = simpleVariation('horseshoe', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  return vec2f((pos.x - pos.y) * (pos.x + pos.y), 2 * pos.x * pos.y).div(r)
})

export const polar = simpleVariation('polar', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  return vec2f(theta / PI.$, r - 1)
})

export const handkerchief = simpleVariation('handkerchief', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  return vec2f(sin(theta + r), cos(theta - r)).mul(r)
})

export const heart = simpleVariation('heart', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  return vec2f(sin(theta * r), -cos(theta * r)).mul(r)
})

export const disc = simpleVariation('disc', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  const thOverPi = theta / PI.$
  return vec2f(sin(PI.$ * r), cos(PI.$ * r)).mul(thOverPi)
})

export const spiral = simpleVariation('spiral', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  return vec2f(cos(theta) + sin(r), sin(theta) - cos(r)).div(r)
})

export const hyperbolic = simpleVariation('hyperbolic', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  return vec2f(sin(theta) / r, r * cos(theta))
})

export const diamond = simpleVariation('diamond', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  return vec2f(sin(theta) * cos(r), cos(theta) * sin(r))
})

export const exVar = simpleVariation('exVar', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  const p0 = sin(theta + r)
  const p1 = cos(theta - r)
  const p03 = p0 * p0 * p0
  const p13 = p1 * p1 * p1
  return vec2f(p03 + p13, p03 - p13).mul(r)
})

export const julia = simpleVariation('julia', (pos, _varInfo) => {
  'use gpu'
  const sqrtr = sqrt(length(pos))
  const theta = atan2(pos.y, pos.x)
  const omega = f32(select(0, PI.$, random() > 0.5))
  const angle = theta / 2.0 + omega
  return vec2f(cos(angle), sin(angle)).mul(sqrtr)
})

export const bent = simpleVariation('bent', (pos, _varInfo) => {
  'use gpu'
  const fx = select(pos.x, 2.0 * pos.x, pos.x < 0)
  const fy = select(pos.y, pos.y / 2.0, pos.y < 0)
  return vec2f(fx, fy)
})

export const fisheye = simpleVariation('fisheye', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const factor = 2 / (r + 1)
  return pos.yx.mul(factor)
})

export const eyefish = simpleVariation('eyefish', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const factor = 2 / (r + 1)
  return pos.mul(factor)
})

export const exponential = simpleVariation('exponential', (pos, _varInfo) => {
  'use gpu'
  const factor = exp(pos.x - 1)
  const piY = PI.$ * pos.y
  return vec2f(cos(piY), sin(piY)).mul(factor)
})

export const power = simpleVariation('power', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const theta = atan2(pos.y, pos.x)
  const sinTheta = sin(theta)
  const factor = pow(r, sinTheta)
  return vec2f(cos(theta), sinTheta).mul(factor)
})

export const cosine = simpleVariation('cosine', (pos, _varInfo) => {
  'use gpu'
  const piX = PI.$ * pos.x
  return vec2f(cos(piX) * cosh(pos.y), -sin(piX) * sinh(pos.y))
})

export const bubble = simpleVariation('bubble', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const r2 = r * r
  const factor = 4 / (r2 + 4)
  return vec2f(pos.x, pos.y).mul(factor)
})

export const cylinder = simpleVariation('cylinder', (pos, _varInfo) => {
  'use gpu'
  return vec2f(sin(pos.x), pos.y)
})

export const noise = simpleVariation('noise', (pos, _varInfo) => {
  'use gpu'
  const rand = random()
  const angle = 2 * PI.$ * random()
  return vec2f(pos.x * cos(angle), pos.y * sin(angle)).mul(rand)
})

export const blurVar = simpleVariation('blurVar', (_pos, _varInfo) => {
  'use gpu'
  const rand = random()
  const angle = 2 * PI.$ * random()
  return vec2f(cos(angle), sin(angle)).mul(rand)
})

export const archVar = simpleVariation('archVar', (_pos, varInfo) => {
  'use gpu'
  const weight = varInfo.weight
  const angle = random() * PI.$ * weight
  return vec2f(sin(angle), (sin(angle) * sin(angle)) / cos(angle))
})

export const tangentVar = simpleVariation('tangentVar', (pos, _varInfo) => {
  'use gpu'
  return vec2f(sin(pos.x) / cos(pos.y), tan(pos.y))
})

export const squareVar = simpleVariation('squareVar', (_pos, _varInfo) => {
  'use gpu'
  const randX = random()
  const randY = random()
  return vec2f(randX - 0.5, randY - 0.5)
})

export const raysVar = simpleVariation('raysVar', (pos, varInfo) => {
  'use gpu'
  const weight = varInfo.weight
  const rand = random()
  const r = length(pos)
  const angle = rand * PI.$ * weight
  const fact = (weight * tan(angle)) / (r * r)
  return vec2f(cos(pos.x), sin(pos.y)).mul(fact)
})

export const bladeVar = simpleVariation('bladeVar', (pos, varInfo) => {
  'use gpu'
  const weight = varInfo.weight
  const rand = random()
  const r = length(pos)
  const angle = rand * r * weight
  return vec2f(cos(angle) + sin(angle), cos(angle) - sin(angle)).mul(pos.x)
})

export const secantVar = simpleVariation('secantVar', (pos, varInfo) => {
  'use gpu'
  const weight = varInfo.weight
  const r = length(pos)
  const angle = weight * r
  return vec2f(pos.x, 1 / (weight * cos(angle)))
})

export const twintrianVar = simpleVariation('twintrianVar', (pos, varInfo) => {
  'use gpu'
  const weight = varInfo.weight
  const r = length(pos)
  const angle = random() * r * weight
  const sinAngle = sin(angle)
  const t = log(sinAngle * sinAngle) / log(10) + cos(angle)
  return vec2f(t, t - PI.$ * sinAngle).mul(pos.x)
})

export const crossVar = simpleVariation('crossVar', (pos, _varInfo) => {
  'use gpu'
  const squareDiff = pos.x * pos.x - pos.y * pos.y
  const fact = sqrt(1 / (squareDiff * squareDiff))
  return vec2f(pos.x, pos.y).mul(fact)
})
