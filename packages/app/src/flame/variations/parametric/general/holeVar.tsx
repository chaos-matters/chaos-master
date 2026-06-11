import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, pow, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const HoleVarParams = struct({
  a: f32,
  inside: f32,
})

type HoleVarParams = Infer<typeof HoleVarParams>

const HoleVarParamsDefaults: HoleVarParams = {
  a: 1.0,
  inside: 0,
}

const HoleVarParamsEditor: EditorFor<HoleVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={0.1}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'inside', 'Inside', props.dataParameterPath)}
      min={0}
      max={1}
      step={1}
    />
  </>
)

export const holeVar = parametricVariation(
  'holeVar',
  HoleVarParams,
  HoleVarParamsDefaults,
  HoleVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const alpha = atan2(pos.y, pos.x)
    const delta = pow(alpha / PI.$ + 1.0, P.a)
    let r = pos.x
    if (P.inside > 0.5) {
      r = delta / (pos.x * pos.x + pos.y * pos.y + delta)
    } else {
      r = sqrt(pos.x * pos.x + pos.y * pos.y + delta)
    }
    return vec2f(r * cos(alpha), r * sin(alpha)).mul(varInfo.weight)
  },
  'general',
)
