import { f32, struct, vec2f } from 'typegpu/data'
import { cos, tanh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const FunnelVarParams = struct({
  effect: f32,
})

type FunnelVarParams = Infer<typeof FunnelVarParams>

const FunnelVarParamsDefaults: FunnelVarParams = {
  effect: 8.0,
}

const FunnelVarParamsEditor: EditorFor<FunnelVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'effect', 'Effect', props.dataParameterPath)}
      min={-20.0}
      max={20.0}
      step={0.1}
    />
  </>
)

export const funnelVar = parametricVariation(
  'funnelVar',
  FunnelVarParams,
  FunnelVarParamsDefaults,
  FunnelVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const w = varInfo.weight
    const add = P.effect * PI.$
    return vec2f(
      pos.x + w * tanh(pos.x) * (1.0 / cos(pos.x) + add),
      pos.y + w * tanh(pos.y) * (1.0 / cos(pos.y) + add),
    )
  },
  'general',
)
