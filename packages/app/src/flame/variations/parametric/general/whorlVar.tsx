import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const WhorlVarParams = struct({
  inside: f32,
  outside: f32,
})

type WhorlVarParams = Infer<typeof WhorlVarParams>

const WhorlVarParamsDefaults: WhorlVarParams = {
  inside: 0.1,
  outside: 0.2,
}

const WhorlVarParamsEditor: EditorFor<WhorlVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'inside', 'Inside', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'outside', 'Outside', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
  </>
)

export const whorlVar = parametricVariation(
  'whorlVar',
  WhorlVarParams,
  WhorlVarParamsDefaults,
  WhorlVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const w = varInfo.weight
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)

    let a = pos.x
    if (r < w) {
      a = atan2(pos.y, pos.x) + P.inside / (w - r)
    } else {
      a = atan2(pos.y, pos.x) + P.outside / (w - r)
    }

    return vec2f(w * r * cos(a), w * r * sin(a))
  },
  'general',
)
