import { f32, struct, vec2f } from 'typegpu/data'
import { cos, floor, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const WoggleVarParams = struct({
  m: f32,
})

type WoggleVarParams = Infer<typeof WoggleVarParams>

const WoggleVarParamsDefaults: WoggleVarParams = {
  m: 2,
}

const WoggleVarParamsEditor: EditorFor<WoggleVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'm', 'M', props.dataParameterPath)}
      min={1}
      max={6}
      step={1}
    />
  </>
)

export const woggleVar = parametricVariation(
  'woggleVar',
  WoggleVarParams,
  WoggleVarParamsDefaults,
  WoggleVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y

    const invN = 1.0 / P.m
    const f = f32(floor(random() * P.m))
    const t = f * invN
    const a = t * 2.0 * PI.$
    const c = cos(a)
    const s = sin(a)

    return vec2f(
      invN * (c * x - s * y) + invN,
      invN * (s * x + c * y) + invN,
    ).mul(varInfo.weight)
  },
  'general',
)
