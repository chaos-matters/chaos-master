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
  a: 1,
  b: 1,
}

const InvCircleParamsEditor: EditorFor<InvCircleParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius')}
      min={1}
      max={200}
      step={1}
    />
    <RangeEditor {...editorProps(props, 'a', 'a')} min={1} max={200} step={1} />
    <RangeEditor {...editorProps(props, 'b', 'b')} min={1} max={200} step={1} />
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
    // if (d2 == 0) {
    // throw new Error('Infinity')
    // return vec2f(Infinity, Infinity) //float('inf'), float('inf')
    // }
    // const squareSum = pos.x * pos.x + pos.y * pos.y
    // return (a + (r * r * dx) / d2, b + (r * r * dy) / d2)
    const r2 = P.radius * P.radius
    const u = (P.a + r2 * dx) / d2
    const v = (P.b + r2 * dy) / d2
    return vec2f(u, v)
  },
)
