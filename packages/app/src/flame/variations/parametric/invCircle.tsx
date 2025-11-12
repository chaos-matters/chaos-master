import { f32, i32, struct, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { CheckboxEditor } from '@/components/Sliders/ParametricEditors/CheckboxEditor'
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
  restricted: i32,
})

const InvCircleParamsDefaults: InvCircleParams = {
  radius: 1,
  a: 0,
  b: 0,
  restricted: 1,
}

const InvCircleParamsEditor: EditorFor<InvCircleParams> = (props) => {
  return (
    <>
      <RangeEditor
        {...editorProps(props, 'radius', 'Radius')}
        min={0}
        max={5}
        step={0.01}
      />
      <RangeEditor
        {...editorProps(props, 'a', 'a')}
        min={-4}
        max={4}
        step={0.01}
      />
      <RangeEditor
        {...editorProps(props, 'b', 'b')}
        min={-4}
        max={4}
        step={0.01}
      />
      <CheckboxEditor {...editorProps(props, 'restricted', 'Restricted')} />
    </>
  )
}

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
    const newPos = vec2f(u, v)
    // restricted/unrestricted circle handling
    // point stays the same if we hit inside of a circle,
    // meaning no transformation happens at this orbit stage,
    // the IFS chaos game will still converge given the following is satisfied:
    //   the starting random point was not inside all defined circles, the circles can
    //   touch and overlap as usual
    return select(newPos, pos, P.restricted === 1 && d2 < r2)
  },
)
