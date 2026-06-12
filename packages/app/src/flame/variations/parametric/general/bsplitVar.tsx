import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin, tan } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BSplitVarParams = struct({
  x: f32,
  y: f32,
})

type BSplitVarParams = Infer<typeof BSplitVarParams>

const BSplitVarParamsDefaults: BSplitVarParams = {
  x: 0.0,
  y: 0.0,
}

const BSplitVarParamsEditor: EditorFor<BSplitVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'X', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const bsplitVar = parametricVariation(
  'bsplitVar',
  BSplitVarParams,
  BSplitVarParamsDefaults,
  BSplitVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const denom = tan(pos.x + P.x)
    return vec2f(
      cos(pos.y + P.y) / denom,
      (-pos.y + P.y) / sin(pos.x + P.x),
    ).mul(varInfo.weight)
  },
  'general',
)
