import { f32, i32, struct, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { CheckboxEditor } from '@/components/Sliders/ParametricEditors/CheckboxEditor'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { quadraticFuncImpl } from '../mathFunctions'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type InvCircle2Params = Infer<typeof InvCircle2Params>
const InvCircle2Params = struct({
  radius: f32,
  a: f32,
  b: f32,
  cx: f32,
  cy: f32,
  restricted: i32,
})

const InvCircle2ParamsDefaults: InvCircle2Params = {
  radius: 1,
  a: 0,
  b: 0,
  cx: 0,
  cy: 0,
  restricted: 1,
}

const CIRCLE_INVERSION_POINT_INSIDE_KERNEL_SCALE = 1.0
const InvCircle2ParamsEditor: EditorFor<InvCircle2Params> = (props) => {
  const r2 = () =>
    props.value.radius *
    props.value.radius *
    CIRCLE_INVERSION_POINT_INSIDE_KERNEL_SCALE
  const cxMinSqrt = () =>
    Math.sqrt(Math.max(0, r2() - Math.pow(props.value.cy - props.value.b, 2)))
  const cxMaxSqrt = () =>
    Math.sqrt(Math.max(0, r2() - Math.pow(props.value.cy - props.value.b, 2)))
  const cyMinSqrt = () =>
    Math.sqrt(Math.max(0, r2() - Math.pow(props.value.cx - props.value.a, 2)))
  const cyMaxSqrt = () =>
    Math.sqrt(Math.max(0, r2() - Math.pow(props.value.cx - props.value.a, 2)))
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
      <RangeEditor
        {...editorProps(props, 'cx', 'Inversion centre x')}
        min={props.value.a - cxMinSqrt()}
        max={props.value.a + cxMaxSqrt()}
        step={0.01}
      />
      <RangeEditor
        {...editorProps(props, 'cy', 'Inversion centre y')}
        min={props.value.b - cyMinSqrt()}
        max={props.value.b + cyMaxSqrt()}
        step={0.01}
      />
      <CheckboxEditor {...editorProps(props, 'restricted', 'Restricted')} />
    </>
  )
}

export const invCircle2 = parametricVariation(
  'invCircle2',
  InvCircle2Params,
  InvCircle2ParamsDefaults,
  InvCircle2ParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const dx = pos.x - P.a
    const dy = pos.y - P.b
    const d2 = dx * dx + dy * dy
    // d2 should not be 0, Ic(0,0) = Inf, Ic(Inf) = 0
    const r2 = P.radius * P.radius
    // calculate solutions for ray intersection with circle, for when inversion point is
    // not center of the circle but rather any point in kernel (inside circle)
    const vx = pos.x - P.cx
    const vy = pos.y - P.cy
    const vx2 = vx * vx
    const vy2 = vy * vy
    const wx = P.cx - P.a
    const wy = P.cy - P.b
    const wx2 = wx * wx
    const wy2 = wy * wy
    const a = vx2 + vy2
    const b = 2.0 * (wx * vx + wy * vy)
    const c = wx2 + wy2 - r2
    const tres = quadraticFuncImpl(a, b, c)
    // minimum positive result should be a match
    const pa = tres[0] > 0.0
    const pb = tres[1] > 0.0
    const noSolution = !pa && !pb
    const tsol = f32(select(0.0, select(tres[1], tres[0], pa), pa || pb))
    const tsol2 = tsol * tsol

    const cu = P.cx + tsol2 * vx
    const cv = P.cy + tsol2 * vy
    const newPos = vec2f(cu, cv)
    // restricted/unrestricted circle handling
    // point stays the same if we hit inside a circle,
    // meaning no transformation happens at this orbit stage,
    // the IFS chaos game will still converge given the following is satisfied:
    //   the starting random point was not inside all defined circles, the circles can
    //   touch and overlap as usual
    return select(newPos, pos, (P.restricted === 1 && d2 < r2) || noSolution)
  },
)
