import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const STwinVarParams = struct({
  distort: f32,
  offset_x2: f32,
  offset_y2: f32,
  offset_xy: f32,
})
type STwinVarParams = Infer<typeof STwinVarParams>
const STwinVarParamsDefaults: STwinVarParams = {
  distort: 0.0,
  offset_x2: 0.0,
  offset_y2: 0.0,
  offset_xy: 0.0,
}
const STwinVarParamsEditor: EditorFor<STwinVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'distort', 'Distort')}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'offset_x2', ' Offset X2 ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'offset_y2', ' Offset Y2 ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'offset_xy', ' Offset XY ')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)
export const sTwinVar = parametricVariation(
  'sTwinVar',
  STwinVarParams,
  STwinVarParamsDefaults,
  STwinVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const multiplier = 0.05
    const multiplier2 = 0.0001
    const multiplier3 = 0.1
    const x = pos.x * varInfo.weight * multiplier
    const y = pos.y * varInfo.weight * multiplier
    const x2 = x * x + P.offset_x2 * multiplier2
    const y2 = y * y + P.offset_y2 * multiplier2
    const term = 2.0 * PI.$ * P.distort * (x + y + P.offset_xy * multiplier3)
    const result = (x2 - y2) * sin(term)
    const result2 = 2.0 * x * y * cos(term)
    return vec2f(result, result2)
  },
  'general',
)
