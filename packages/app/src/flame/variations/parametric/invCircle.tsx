import { f32, i32, struct, vec2f } from 'typegpu/data'
import { CheckboxEditor } from '@/components/Sliders/ParametricEditors/Checkbox'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { ComplexInfo, complexVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type InvCircleParams = Infer<typeof InvCircleParams>
const InvCircleParams = struct({
  radius: f32,
  cx: f32,
  cy: f32,
  restricted: i32,
})

const InvCircleParamsDefaults: InvCircleParams = {
  radius: 1,
  cx: 0,
  cy: 0,
  restricted: 1,
}

const InvCircleParamsEditor: EditorFor<InvCircleParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius')}
      min={-3}
      max={3}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'cx', 'a')}
      min={-10}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'cy', 'b')}
      min={-10}
      max={10}
      step={0.1}
    />
    <CheckboxEditor {...editorProps(props, 'restricted', 'Restricted')} />
  </>
)

export const invCircle = complexVariation(
  'invCircle',
  InvCircleParams,
  InvCircleParamsDefaults,
  InvCircleParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const dx = pos.x - P.cx
    const dy = pos.y - P.cy
    const d2 = dx * dx + dy * dy
    // d2 should not be 0, Ic(0,0) = Inf, Ic(Inf) = 0
    const r2 = P.radius * P.radius
    // restricted/unrestricted circle handling
    // initialize as a proper WGSL struct to avoid runtime type inference errors
    const out: ComplexInfo = ComplexInfo({ restrictNext: 0, transformed: pos })
    if (P.restricted === 1) {
      if (d2 < r2) {
        out.restrictNext = 1
      }
    }
    const u = P.cx + (r2 * dx) / d2
    const v = P.cy + (r2 * dy) / d2
    // return vec2f(u, v)
    out.transformed = vec2f(u, v)
    return out
  },
)
