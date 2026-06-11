import { f32, struct, vec2f } from 'typegpu/data'
import { sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SintrangeVarParams = struct({
  w: f32,
})

type SintrangeVarParams = Infer<typeof SintrangeVarParams>

const SintrangeVarParamsDefaults: SintrangeVarParams = {
  w: 1.0,
}

const SintrangeVarParamsEditor: EditorFor<SintrangeVarParams> = (props) => (
  <RangeEditor
    {...editorProps(props, 'w', 'W', props.dataParameterPath)}
    min={0}
    max={5}
    step={0.01}
  />
)

export const sintrangeVar = parametricVariation(
  'sintrangeVar',
  SintrangeVarParams,
  SintrangeVarParamsDefaults,
  SintrangeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const v = (pos.x * pos.x + pos.y * pos.y) * P.w
    return vec2f(
      sin(pos.x) * (pos.x * pos.x + P.w - v),
      sin(pos.y) * (pos.y * pos.y + P.w - v),
    ).mul(varInfo.weight)
  },
  'general',
)
