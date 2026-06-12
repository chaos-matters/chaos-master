import { f32, struct, vec2f } from 'typegpu/data'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type RadialBlurParams = Infer<typeof RadialBlurParams>
const RadialBlurParams = struct({
  angle: f32,
})

const RadialBlurParamsDefaults: RadialBlurParams = {
  angle: 0,
}

const RadialBlurParamsEditor: EditorFor<RadialBlurParams> = (_props) => <></>

export const radialBlur = parametricVariation(
  'radialBlurVar',
  RadialBlurParams,
  RadialBlurParamsDefaults,
  RadialBlurParamsEditor,
  (pos, varInfo, _P) => {
    'use gpu'
    return vec2f(pos).mul(varInfo.weight)
  },
  'blur',
)
