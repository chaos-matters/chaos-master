import { f32, struct, vec2f } from 'typegpu/data'
import { select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const OnionVarParams = struct({
  centre_x: f32,
  centre_y: f32,
})
type OnionVarParams = Infer<typeof OnionVarParams>
const OnionVarParamsDefaults: OnionVarParams = {
  centre_x: 0.0,
  centre_y: 0.0,
}
const OnionVarParamsEditor: EditorFor<OnionVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'centre_x', ' Centre X ')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'centre_y', ' Centre Y ')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)
export const onionVar = parametricVariation(
  'onionVar',
  OnionVarParams,
  OnionVarParamsDefaults,
  OnionVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r0_in = varInfo.weight
    const r0 = select(r0_in, 1.0, r0_in === 0.0)
    const x0 = pos.x - P.centre_x
    const y0 = pos.y - P.centre_y
    const d0 = x0 * x0 + y0 * y0
    const dr = sqrt(d0)
    const safe_dr = select(dr, 1.0e-9, dr === 0.0)
    const x1_a = x0
    const y1_a = y0
    const term = (2.0 * r0 - dr) / safe_dr
    const x1_b = x0 * term
    const y1_b = y0 * term
    const x1_c = (x0 * (2.0 * r0 + dr)) / safe_dr
    const y1_c = (y0 * (2.0 * r0 + dr)) / safe_dr
    const cond1 = d0 <= r0 * r0
    const cond2 = 2.0 * r0 - dr > r0 * 0.70710678
    const newX = select(select(x1_c, x1_b, cond2), x1_a, cond1) + P.centre_x
    const newY = select(select(y1_c, y1_b, cond2), y1_a, cond1) + P.centre_y
    return vec2f(newX, newY)
  },
  'general',
)
