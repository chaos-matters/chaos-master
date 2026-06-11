import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CirclesplitVarParams = struct({
  radius: f32,
  split: f32,
})

type CirclesplitVarParams = Infer<typeof CirclesplitVarParams>

const CirclesplitVarParamsDefaults: CirclesplitVarParams = {
  radius: 1.0,
  split: 0.5,
}

const CirclesplitVarParamsEditor: EditorFor<CirclesplitVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'split', 'Split', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const circlesplitVar = parametricVariation(
  'circlesplitVar',
  CirclesplitVarParams,
  CirclesplitVarParamsDefaults,
  CirclesplitVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    if (r < P.radius - P.split) {
      return vec2f(pos.x, pos.y).mul(varInfo.weight)
    }
    const a = atan2(pos.y, pos.x)
    const len = r + P.split
    return vec2f(cos(a) * len, sin(a) * len).mul(varInfo.weight)
  },
  'general',
)
