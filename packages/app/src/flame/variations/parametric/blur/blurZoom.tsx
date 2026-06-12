import { f32, struct, vec2f } from 'typegpu/data'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type BlurZoomParams = Infer<typeof BlurZoomParams>
const BlurZoomParams = struct({
  length: f32,
  x: f32,
  y: f32,
})

const BlurZoomParamsDefaults: BlurZoomParams = {
  length: 0.24,
  x: 0.2,
  y: -0.1,
}

const BlurZoomParamsEditor: EditorFor<BlurZoomParams> = (_props) => <></>

export const blurZoom = parametricVariation(
  'blurZoomVar',
  BlurZoomParams,
  BlurZoomParamsDefaults,
  BlurZoomParamsEditor,
  (pos, varInfo, _P) => {
    'use gpu'
    return vec2f(pos).mul(varInfo.weight)
  },
  'blur',
)
