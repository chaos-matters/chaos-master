import { f32, struct, vec2f } from 'typegpu/data'
import { length, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const OctagonVarParams = struct({
  splits: f32, // int
})
type OctagonVarParams = Infer<typeof OctagonVarParams>
const OctagonVarParamsDefaults: OctagonVarParams = {
  splits: 5.0,
}
const OctagonVarParamsEditor: EditorFor<OctagonVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'splits', 'Splits')}
      min={0}
      max={6}
      step={1}
    />
  </>
)
export const octagonVar = parametricVariation(
  'octagonVar',
  OctagonVarParams,
  OctagonVarParamsDefaults,
  OctagonVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r = length(pos)
    const t = sqrt(r * r + 1.0)
    const s = P.splits
    let m = pos.x
    const w = varInfo.weight
    const w_half = w * 0.5
    if (s === 0.0) {
      m = select(1.0 + 1.0 / r, 1.0 + 1.0 / t, t <= w_half)
    } else if (s === 1.0) {
      m = select(1.0 - 1.0 / r, 1.0 - 1.0 / t, t <= w_half)
    } else if (s === 2.0) {
      m = select(1.0 / r - 1.0, 1.0 / t - 1.0, t <= w_half)
    } else if (s === 3.0) {
      m = select(-1.0 / r - 1.0, -1.0 / t - 1.0, t <= w_half)
    } else if (s === 4.0) {
      m = select(1.0 / r, 1.0 / t, t <= w_half)
    } else if (s === 5.0) {
      m = select(1.0 / r, 1.0 / t, t <= w_half)
    } else {
      m = select(1.0 + 1.0 / r, 1.0 + 1.0 / t, t <= w_half)
    }
    const newX = w * m * pos.x
    const newY = w * m * pos.y
    return vec2f(newX, newY)
  },
  'general',
)
