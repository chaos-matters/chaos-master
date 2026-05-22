import { tgpu } from 'typegpu'
import { vec2f } from 'typegpu/data'
import { randomGaussianCircle, randomGaussianDisk, randomGaussianSquare, randomUnitDisk, randomUnitSquare, } from '@/shaders/random'
import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'

const pointInitModeFn = tgpu.fn([], vec2f)

export const pointInitModeUnitDisk = pointInitModeFn(() => {
  'use gpu'
  return randomUnitDisk()
})

export const pointInitModeGaussianDisk = pointInitModeFn(() => {
  'use gpu'
  return randomGaussianDisk()
})

export const pointInitModeUnitSquare = pointInitModeFn(() => {
  'use gpu'
  return randomUnitSquare()
})

export const pointInitModeGaussianSquare = pointInitModeFn(() => {
  'use gpu'
  return randomGaussianSquare()
})

export const pointInitModeGaussianCircle = pointInitModeFn(() => {
  'use gpu'
  return randomGaussianCircle()
})

export const pointInitModeToImplFn = {
  pointInitUnitDisk: pointInitModeUnitDisk,
  pointInitGaussianDisk: pointInitModeGaussianDisk,
  pointInitUnitSquare: pointInitModeUnitSquare,
  pointInitModeGaussianSquare: pointInitModeGaussianSquare,
  pointInitModeGaussianCircle: pointInitModeGaussianCircle,
}

export type PointInitMode = v.InferOutput<typeof PointInitMode>
export const PointInitMode = v.picklist(recordKeys(pointInitModeToImplFn))
