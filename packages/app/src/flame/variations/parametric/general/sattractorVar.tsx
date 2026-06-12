import { f32, struct, vec2f } from 'typegpu/data'
import { cos, floor, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SattractorVarParams = struct({
  m: f32,
})

type SattractorVarParams = Infer<typeof SattractorVarParams>

const SattractorVarParamsDefaults: SattractorVarParams = {
  m: 5,
}

const SattractorVarParamsEditor: EditorFor<SattractorVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'm', 'M', props.dataParameterPath)}
      min={2}
      max={12}
      step={1}
    />
  </>
)

export const sattractorVar = parametricVariation(
  'sattractorVar',
  SattractorVarParams,
  SattractorVarParamsDefaults,
  SattractorVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y

    const l = f32(floor(random() * P.m)) + 1.0
    const a = cos((2.0 * PI.$ * l) / P.m)
    const b = sin((2.0 * PI.$ * l) / P.m)

    let nx = pos.x
    let ny = pos.y

    if (random() < 0.5) {
      nx = x / 2.0 + a
      ny = y / 2.0 + b
    } else {
      nx = x * a + y * b + x * x * b
      ny = y * a - x * b + x * x * a
    }

    return vec2f(pos.x + nx * 0.5, pos.y + ny * 0.5).mul(varInfo.weight)
  },
  'general',
)
