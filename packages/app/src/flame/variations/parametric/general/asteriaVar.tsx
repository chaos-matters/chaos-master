import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const AsteriaVarParams = struct({
  alpha: f32,
})
type AsteriaVarParams = Infer<typeof AsteriaVarParams>
const AsteriaVarParamsDefaults: AsteriaVarParams = {
  alpha: 0.0,
}
const AsteriaVarParamsEditor: EditorFor<AsteriaVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'alpha', 'Alpha')}
      min={0}
      max={1}
      step={0.01}
    />
  </>
)
export const asteriaVar = parametricVariation(
  'asteriaVar',
  AsteriaVarParams,
  AsteriaVarParamsDefaults,
  AsteriaVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sina = sin(PI.$ * P.alpha)
    const cosa = cos(PI.$ * P.alpha)
    const x0 = varInfo.weight * pos.x
    const y0 = varInfo.weight * pos.y
    let xx = x0
    let yy = y0
    const r = xx * xx + yy * yy
    xx = (abs(xx) - 1.0) * (abs(xx) - 1.0)
    yy = (abs(yy) - 1.0) * (abs(yy) - 1.0)
    const r2 = sqrt(yy + xx)
    const cond1 = r < 1.0
    const cond2 = r2 < 1.0
    let in1 = false
    if (cond1 && cond2) {
      in1 = random() > 0.35
    } else {
      in1 = !cond1
    }
    let dx = pos.x
    let dy = pos.y
    if (in1) {
      dx = x0
      dy = y0
    } else {
      dx = x0 * cosa - y0 * sina
      dy = x0 * sina + y0 * cosa
    }
    return vec2f(dx, dy)
  },
  'general',
)
