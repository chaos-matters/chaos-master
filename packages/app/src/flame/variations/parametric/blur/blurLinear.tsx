import { f32, struct, vec2f } from 'typegpu/data'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type BlurLinearParams = Infer<typeof BlurLinearParams>
const BlurLinearParams = struct({
  length: f32,
  angle: f32,
})

const BlurLinearParamsDefaults: BlurLinearParams = {
  length: 0.5,
  angle: 0,
}

const BlurLinearParamsEditor: EditorFor<BlurLinearParams> = (_props) => <></>

export const blurLinear = parametricVariation(
  'blurLinearVar',
  BlurLinearParams,
  BlurLinearParamsDefaults,
  BlurLinearParamsEditor,
  (pos, varInfo, _P) => {
    'use gpu'
    return vec2f(pos).mul(varInfo.weight)
  },
  'blur',
)
