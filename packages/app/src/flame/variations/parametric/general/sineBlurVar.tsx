import { f32, struct, vec2f } from 'typegpu/data'
import { acos, cos, exp, log, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SineBlurVarParams = struct({
  power: f32,
})

type SineBlurVarParams = Infer<typeof SineBlurVarParams>

const SineBlurVarParamsDefaults: SineBlurVarParams = {
  power: 1.0,
}

const SineBlurVarParamsEditor: EditorFor<SineBlurVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power', props.dataParameterPath)}
      min={0.1}
      max={10}
      step={0.01}
    />
  </>
)

export const sineBlurVar = parametricVariation(
  'sineBlurVar',
  SineBlurVarParams,
  SineBlurVarParamsDefaults,
  SineBlurVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const ang = random() * PI.$ * 2.0
    const isOne = P.power === 1.0
    const rOne = acos(random() * 2.0 - 1.0) / PI.$
    const rOther = exp(log(random()) * P.power) / PI.$
    const r = select(rOther, rOne, isOne)
    return vec2f(pos.x + r * cos(ang), pos.y + r * sin(ang)).mul(varInfo.weight)
  },
  'general',
)
