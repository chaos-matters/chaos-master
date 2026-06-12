import { f32, vec3f } from 'typegpu/data'
import { acos, atan2, cos, dot, exp, length, pow, select, sin, sqrt, } from 'typegpu/std'
import { random, randomUnitSphere } from '@/shaders/random'
import { EPS, PI } from '../../constants'
import { simpleVariation3D } from './types'

export const linear3D = simpleVariation3D('linear3D', (pos, _varInfo) => {
  'use gpu'
  return vec3f(pos)
})

export const spherical3D = simpleVariation3D('spherical3D', (pos, _varInfo) => {
  'use gpu'
  const r2 = dot(pos, pos) + EPS.$
  return pos.div(r2)
})

export const sinusoidal3D = simpleVariation3D(
  'sinusoidal3D',
  (pos, _varInfo) => {
    'use gpu'
    return vec3f(sin(pos.x), sin(pos.y), sin(pos.z))
  },
)

export const swirl3D = simpleVariation3D('swirl3D', (pos, _varInfo) => {
  'use gpu'
  const r2 = dot(pos, pos)
  const s2 = sin(r2)
  const c2 = cos(r2)
  return vec3f(pos.x * c2 - pos.y * s2, pos.x * s2 + pos.y * c2, pos.z)
})

export const julia3D = simpleVariation3D('julia3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const rOrEps = select(r, EPS.$, r < EPS.$)
  const sqrtr = sqrt(r)
  const theta = atan2(pos.y, pos.x)
  const phi = acos(pos.z / rOrEps)
  const sign = f32(select(1, -1, random() > 0.5))
  const hTheta = theta / 2
  const hPhi = phi / 2
  return vec3f(
    sin(hPhi) * cos(hTheta) * sign,
    sin(hPhi) * sin(hTheta) * sign,
    cos(hPhi) * sign,
  ).mul(sqrtr)
})

export const horseshoe3D = simpleVariation3D('horseshoe3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const rOrEps = select(r, EPS.$, r < EPS.$)
  return vec3f(
    (pos.x - pos.y) * (pos.x + pos.y + pos.z),
    2 * pos.x * (pos.y + pos.z),
    (pos.y - pos.z) * (pos.y + pos.z),
  ).div(rOrEps)
})

export const polar3D = simpleVariation3D('polar3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  const rOrEps = select(r, EPS.$, r < EPS.$)
  const theta = atan2(pos.y, pos.x)
  const phi = acos(pos.z / rOrEps)
  return vec3f(theta / PI.$, phi / (PI.$ / 2) - 1, r - 1)
})

export const bubble3D = simpleVariation3D('bubble3D', (pos, _varInfo) => {
  'use gpu'
  const r2 = dot(pos, pos)
  const factor = 4 / (r2 + 4)
  return pos.mul(factor)
})

export const cylinder3D = simpleVariation3D('cylinder3D', (pos, _varInfo) => {
  'use gpu'
  return vec3f(sin(pos.x), pos.y, pos.z)
})

export const gaussian3D = simpleVariation3D(
  'gaussian3D',
  (_pos, _varInfo) => {
    'use gpu'
    const r = random() + random() + random() + random() - 2
    return randomUnitSphere().mul(r)
  },
  'blur',
)

export const spiral3D = simpleVariation3D('spiral3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos) + EPS.$
  const theta = atan2(pos.y, pos.x)
  const c = cos(theta + r)
  const s = sin(theta + r)
  return vec3f(pos.x * c - pos.y * s, pos.x * s + pos.y * c, pos.z).div(r)
})

export const cross3D = simpleVariation3D('cross3D', (pos, _varInfo) => {
  'use gpu'
  const r2 = dot(pos, pos)
  const s = sqrt(1 / (r2 * r2 + EPS.$))
  return pos.mul(s)
})

export const curl3D = simpleVariation3D('curl3D', (pos, _varInfo) => {
  'use gpu'
  const t1 = 1 + pos.x
  const t2 = pos.y * pos.y + pos.z * pos.z
  const d = t1 * t1 + t2 + EPS.$
  return vec3f((t1 * t1 - t2) / d, (2 * pos.y * t1) / d, (2 * pos.z * t1) / d)
})

export const heart3D = simpleVariation3D('heart3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos) + EPS.$
  const theta = atan2(pos.y, pos.x)
  const phi = acos(pos.z / r)
  return vec3f(
    sin(theta * r) * sin(phi * r),
    cos(theta * r) * sin(phi * r),
    cos(phi * r),
  ).mul(r)
})

export const fisheye3D = simpleVariation3D('fisheye3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  return pos.mul(2 / (r + 1))
})

export const eyefish3D = simpleVariation3D('eyefish3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos)
  return pos.mul((2 * r) / (r + 1))
})

export const ex3D = simpleVariation3D('ex3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos) + EPS.$
  const theta = atan2(pos.y, pos.x)
  const phi = acos(pos.z / r)
  const p0 = sin(theta + r)
  const p1 = cos(theta - r)
  const p2 = sin(phi + r)
  const p3 = cos(phi - r)
  return vec3f(
    r * (p0 * p0 * p0 + p1 * p1 * p1),
    r * (p1 * p1 * p1 + p2 * p2 * p2),
    r * (p2 * p2 * p2 + p3 * p3 * p3),
  )
})

export const disc3D = simpleVariation3D('disc3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos) + EPS.$
  const rOrEps = select(r, EPS.$, r < EPS.$)
  const theta = atan2(pos.y, pos.x) / PI.$
  const phi = acos(pos.z / rOrEps)
  return vec3f(
    theta * sin(PI.$ * r) * sin(phi),
    theta * cos(PI.$ * r) * sin(phi),
    theta * cos(phi),
  )
})

export const diamond3D = simpleVariation3D('diamond3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos) + EPS.$
  const rinv = 1.0 / r
  return vec3f(
    pos.x * rinv * cos(r),
    pos.y * rinv * sin(r),
    pos.z * rinv * cos(r),
  )
})

export const bent3D = simpleVariation3D('bent3D', (pos, _varInfo) => {
  'use gpu'
  const nx = select(pos.x, 2.0 * pos.x, pos.x < 0.0)
  const ny = select(pos.y, 0.5 * pos.y, pos.y < 0.0)
  const nz = select(pos.z, 0.5 * pos.z, pos.z < 0.0)
  return vec3f(nx, ny, nz)
})

export const exponential3D = simpleVariation3D(
  'exponential3D',
  (pos, _varInfo) => {
    'use gpu'
    const d = exp(pos.x - 1.0)
    const r = PI.$ * pos.y
    const phi = PI.$ * pos.z
    return vec3f(d * cos(r) * cos(phi), d * sin(r) * cos(phi), d * sin(phi))
  },
)

export const power3D = simpleVariation3D('power3D', (pos, _varInfo) => {
  'use gpu'
  const r = length(pos) + EPS.$
  const theta = atan2(pos.y, pos.x)
  const phi = acos(pos.z / r)
  const sr = pow(r, sin(theta))
  return vec3f(
    sr * cos(theta) * sin(phi),
    sr * sin(theta) * sin(phi),
    sr * cos(phi),
  )
})

export const handkerchief3D = simpleVariation3D(
  'handkerchief3D',
  (pos, _varInfo) => {
    'use gpu'
    const r = length(pos) + EPS.$
    const theta = atan2(pos.y, pos.x)
    const phi = acos(pos.z / r)
    return vec3f(
      r * sin(theta + r) * sin(phi),
      r * cos(theta - r) * sin(phi),
      r * cos(phi + r),
    )
  },
)

export const cylindrical3D = simpleVariation3D(
  'cylindrical3D',
  (pos, _varInfo) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    return vec3f(sin(pos.x) * r, cos(pos.x) * r, pos.z)
  },
)
