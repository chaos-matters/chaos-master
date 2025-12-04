import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, dot, exp, floor, log, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type CPowVarParams = Infer<typeof CPowVarParams>
const CPowVarParams = struct({
  r: f32,
  i: f32,
  power: f32,
})

const CPowVarParamsDefaults: CPowVarParams = {
  r: 1.0,
  i: 0.1,
  power: 1.5,
}

const CPowVarParamsEditor: EditorFor<CPowVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'r', 'r')}
      min={0}
      max={100}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'i', 'i')}
      min={0}
      max={100}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'power', 'power')}
      min={0}
      max={100}
      step={0.1}
    />
  </>
)

export const cpowVar = parametricVariation(
  'cpowVar',
  CPowVarParams,
  CPowVarParamsDefaults,
  CPowVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const a = atan2(pos.y, pos.x)
    const sumSq = dot(pos, pos)
    const lnr = 0.5 * log(sumSq)
    const va = 2.0 * PI.$
    const vc = P.r / P.power
    const vd = P.i / P.power
    const angle = vc * a * vd * lnr * va * floor(P.power * random())

    const m = exp(vc * lnr - vd * a)
    const sa = sin(angle)
    const ca = cos(angle)
    return vec2f(m * ca, m * sa)
  },
)
