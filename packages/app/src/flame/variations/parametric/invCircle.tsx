import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type InvCircleParams = Infer<typeof InvCircleParams>
const InvCircleParams = struct({
  radius: f32,
  a: f32,
  b: f32,
})

const InvCircleParamsDefaults: InvCircleParams = {
  radius: 2,
  a: 0,
  b: 0,
}

const InvCircleParamsEditor: EditorFor<InvCircleParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius')}
      min={1}
      max={200}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'a', 'a')}
      min={0}
      max={20}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'b')}
      min={0}
      max={20}
      step={0.1}
    />
  </>
)

export const invCircle = parametricVariation(
  'invCircle',
  InvCircleParams,
  InvCircleParamsDefaults,
  InvCircleParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const dx = pos.x - P.a
    const dy = pos.y - P.b
    const d2 = dx * dx + dy * dy
    // d2 should not be 0, Ic(0,0) = Inf, Ic(Inf) = 0
    const r2 = P.radius * P.radius
    const u = P.a + (r2 * dx) / d2
    const v = P.b + (r2 * dy) / d2
    return vec2f(u, v)
  },
)
