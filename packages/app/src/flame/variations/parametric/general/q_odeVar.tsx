import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Q_odeVarParams = struct({
  q_ode01: f32,
  q_ode02: f32,
  q_ode03: f32,
  q_ode04: f32,
  q_ode05: f32,
  q_ode06: f32,
  q_ode07: f32,
  q_ode08: f32,
  q_ode09: f32,
  q_ode10: f32,
  q_ode11: f32,
  q_ode12: f32,
})
type Q_odeVarParams = Infer<typeof Q_odeVarParams>
const Q_odeVarParamsDefaults: Q_odeVarParams = {
  q_ode01: 0.0,
  q_ode02: 1.0,
  q_ode03: 0.5,
  q_ode04: -0.3,
  q_ode05: 0.2,
  q_ode06: -0.4,
  q_ode07: 0.0,
  q_ode08: 1.0,
  q_ode09: 0.3,
  q_ode10: -0.5,
  q_ode11: -0.6,
  q_ode12: 0.4,
}
const Q_odeVarParamsEditor: EditorFor<Q_odeVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'q_ode01', ' Q 01 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode02', ' Q 02 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode03', ' Q 03 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode04', ' Q 04 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode05', ' Q 05 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode06', ' Q 06 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode07', ' Q 07 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode08', ' Q 08 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode09', ' Q 09 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode10', ' Q 10 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode11', ' Q 11 ')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'q_ode12', ' Q 12 ')}
      min={-2}
      max={2}
      step={0.01}
    />
  </>
)
export const q_odeVar = parametricVariation(
  'q_odeVar',
  Q_odeVarParams,
  Q_odeVarParamsDefaults,
  Q_odeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const w = varInfo.weight
    // JWildfire Q_ode: 2D bivariate quadratic polynomial
    // q_ode02 and q_ode11 are the only params scaled by pAmount (weight)
    const dx =
      P.q_ode01 +
      w * P.q_ode02 * x +
      P.q_ode03 * x * x +
      P.q_ode04 * x * y +
      P.q_ode05 * y +
      P.q_ode06 * y * y
    const dy =
      P.q_ode07 +
      P.q_ode08 * x +
      P.q_ode09 * x * x +
      P.q_ode10 * x * y +
      w * P.q_ode11 * y +
      P.q_ode12 * y * y
    return vec2f(x + dx, y + dy)
  },
  'general',
)
