import { tgpu } from 'typegpu'
import { u32, vec3f } from 'typegpu/data'
import { randomUnitBall, randomUnitSphere } from '@/shaders/random'
import { recordKeys } from '@/utils/record'
import * as v from '@/valibot'

const pointInitMode3DFn = tgpu.fn([u32], vec3f)

export const pointInitModeUnitSphere = pointInitMode3DFn((_index) => {
  'use gpu'
  return randomUnitSphere()
})

export const pointInitModeUnitBall = pointInitMode3DFn((_index) => {
  'use gpu'
  return randomUnitBall()
})

export const pointInitMode3DToImplFn = {
  pointInitUnitSphere: pointInitModeUnitSphere,
  pointInitUnitBall: pointInitModeUnitBall,
}

export function isPointInitMode3D(mode: string): mode is PointInitMode3D {
  return mode in pointInitMode3DToImplFn
}

export type PointInitMode3D = v.InferOutput<typeof PointInitMode3D>
export const PointInitMode3D = v.picklist(recordKeys(pointInitMode3DToImplFn))
