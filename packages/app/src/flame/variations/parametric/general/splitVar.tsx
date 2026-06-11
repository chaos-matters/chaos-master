import { f32, struct, vec2f } from 'typegpu/data'
import { cos, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SplitVarParams = struct({
  xSize: f32,
  ySize: f32,
})

type SplitVarParams = Infer<typeof SplitVarParams>

const SplitVarParamsDefaults: SplitVarParams = {
  xSize: 0.4,
  ySize: 0.6,
}

const SplitVarParamsEditor: EditorFor<SplitVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'xSize', 'X Size', props.dataParameterPath)}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ySize', 'Y Size', props.dataParameterPath)}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)

export const splitVar = parametricVariation(
  'splitVar',
  SplitVarParams,
  SplitVarParamsDefaults,
  SplitVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xVal = select(-pos.x, pos.x, cos(pos.x * P.xSize * PI.$) >= 0.0)
    const yVal = select(-pos.y, pos.y, cos(pos.y * P.ySize * PI.$) >= 0.0)
    return vec2f(xVal, yVal).mul(varInfo.weight)
  },
  'general',
)
