import { perlin2d } from '@typegpu/noise'
import { tgpu } from 'typegpu'
import { f32, u32, vec2f } from 'typegpu/data'
import { cos, floor, log, mul, sin, sqrt } from 'typegpu/std'
import { random } from '@/shaders/random'
import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'
import { PI } from './constants'

const pointInitModeFn = tgpu.fn([u32], vec2f)

export const pointInitModeCircle = pointInitModeFn((_index) => {
  'use gpu'
  const r = sqrt(random())
  const theta = random() * 2 * PI.$
  return mul(r, vec2f(cos(theta), sin(theta)))
})

export const pointInitModeSquare = pointInitModeFn((_index) => {
  'use gpu'
  const size = f32(1.0)
  const randxy = vec2f(random() - 0.5, random() - 0.5)
  const k = f32(size * 2.0 - size)
  return mul(k, randxy)
})

export const pointInitModeCross = pointInitModeFn((_index) => {
  'use gpu'
  const r1 = random()
  const r2 = random()

  const t = r1 * 2.0 - 1.0
  if (r2 < 0.5) {
    return vec2f(t, t)
  } else {
    return vec2f(t, -t)
  }
})

export const pointInitModeTriangle = pointInitModeFn((_index) => {
  'use gpu'
  const r1 = random()
  const r2 = random()

  // sqrt(r1) ensures uniform sampling across the area of the triangle
  const s = sqrt(r1)
  const a = f32(1.0) - s
  const b = s * (f32(1.0) - r2)
  const c = s * r2

  const x = a * -1.0 + b * 1.0 + c * 0.0
  const y = a * -1.0 + b * -1.0 + c * 1.0

  return vec2f(x, y)
})

export const pointInitModeGaussian = pointInitModeFn((_index) => {
  'use gpu'
  // box-muller transform requires non-zero inputs for the log function
  // Adding a tiny epsilon to avoid log(0)
  const u1 = random() + f32(1e-6)
  const u2 = random()

  // todo: standard deviation (sigma), 0.4 keeps most points within [-1, 1]
  const sigma = f32(0.4)
  const radius = sigma * sqrt(f32(-2.0) * log(u1))
  const theta = u2 * f32(2.0) * PI.$

  return vec2f(radius * cos(theta), radius * sin(theta))
})

export const pointInitModeAnnulus = pointInitModeFn((_index) => {
  'use gpu'
  const inner = f32(0.4)
  const outer = f32(1.0)

  const r = sqrt(random() * (outer * outer - inner * inner) + inner * inner)
  const theta = random() * 2.0 * PI.$

  return vec2f(r * cos(theta), r * sin(theta))
})

export const pointInitModeStar = pointInitModeFn((_index) => {
  'use gpu'
  const spikes = f32(5.0)
  const theta = random() * 2.0 * PI.$

  // create radial modulation
  const k = f32(0.5) + f32(0.5) * cos(theta * spikes)

  const r = sqrt(random()) * k
  return vec2f(r * cos(theta), r * sin(theta))
})

export const pointInitModeHexagon = pointInitModeFn((_index) => {
  'use gpu'
  const r1 = random()
  const r2 = random()

  // pick one of 6 triangles
  const sector = f32(floor(random() * 6.0))
  const angle = sector * (PI.$ / 3.0)

  // barycentric sampling inside triangle
  const s = sqrt(r1)
  const a = 1.0 - s
  const b = s * (1.0 - r2)
  const c = s * r2

  // triangle points: center + two hex vertices
  const v1 = vec2f(0.0, 0.0)
  const v2 = vec2f(cos(angle), sin(angle))
  const v3 = vec2f(cos(angle + PI.$ / 3.0), sin(angle + PI.$ / 3.0))

  return vec2f(a * v1.x + b * v2.x + c * v3.x, a * v1.y + b * v2.y + c * v3.y)
})

export const pointInitModeSpiral = pointInitModeFn((_index) => {
  'use gpu'
  const t = random()

  const turns = f32(3.0)
  const theta = t * turns * 2.0 * PI.$

  // radius grows with t
  const r = t

  return vec2f(r * cos(theta), r * sin(theta))
})

function halton(index: number, base: number): number {
  'use gpu'
  let f = f32(1.0)
  let r = f32(0.0)
  let i = index

  while (i > 0) {
    f = f / f32(base)
    r = r + f * f32(i % base)
    i = u32(floor(f32(i) / f32(base)))
  }

  return r
}

export const pointInitModeHalton = pointInitModeFn((index) => {
  'use gpu'

  const x = halton(index + 1, u32(2))
  const y = halton(index + 1, u32(3))

  return vec2f(x, y).mul(2.0).sub(1.0)
})

export const pointInitModePerlin = pointInitModeFn((_index) => {
  'use gpu'
  const xy = vec2f(random(), random())
  const nx = perlin2d.sample(xy.mul(0.9))
  return vec2f(xy).add(nx)
})

export const pointInitModeToImplFn = {
  pointInitCircle: pointInitModeCircle,
  pointInitSquare: pointInitModeSquare,
  pointInitCross: pointInitModeCross,
  pointInitTriangle: pointInitModeTriangle,
  pointInitGaussian: pointInitModeGaussian,

  pointInitAnnulus: pointInitModeAnnulus,
  pointInitStar: pointInitModeStar,
  pointInitHexagon: pointInitModeHexagon,
  pointInitSpiral: pointInitModeSpiral,
  pointInitHalton: pointInitModeHalton,
  pointInitPerlin: pointInitModePerlin,
}

export type PointInitMode = v.InferOutput<typeof PointInitMode>
export const PointInitMode = v.picklist(recordKeys(pointInitModeToImplFn))
