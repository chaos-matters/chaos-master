import { f32, i32, struct, vec2f } from 'typegpu/data'
import { abs, cos, max, round, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Scry2VarParams = struct({
  sides: f32,
  star: f32,
  circle: f32,
})

type Scry2VarParams = Infer<typeof Scry2VarParams>

const Scry2VarParamsDefaults: Scry2VarParams = {
  sides: 4.0,
  star: 0.0,
  circle: 0.0,
}

const Scry2VarParamsEditor: EditorFor<Scry2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'sides', 'Sides')}
      min={0}
      max={30}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'star', 'Star')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'circle', 'Circle')}
      min={-1}
      max={1}
      step={0.01}
    />
  </>
)

export const scry2Var = parametricVariation(
  'scry2Var',
  Scry2VarParams,
  Scry2VarParamsDefaults,
  Scry2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const sides = i32(round(P.sides))
    const a_poly = (2.0 * PI.$) / f32(sides)
    const sina = sin(a_poly)
    const cosa = cos(a_poly)

    const a_star = -PI.$ * 0.5 * P.star
    const sins = sin(a_star)
    const coss = cos(a_star)

    const a_circ = PI.$ * 0.5 * P.circle
    const sinc = sin(a_circ)
    const cosc = cos(a_circ)

    let xrt = pos.x
    let yrt = pos.y
    let r2 = f32(xrt * coss + abs(yrt) * sins)
    let r1 = f32(0.0)
    const circle = sqrt(xrt * xrt + yrt * yrt)

    let i = 0
    for (i = 0; i < sides - 1; i++) {
      const swp = xrt * cosa - yrt * sina
      yrt = xrt * sina + yrt * cosa
      xrt = swp
      r2 = max(r2, xrt * coss + abs(yrt) * sins)
    }

    r2 = r2 * cosc + circle * sinc
    r1 = r2

    if (i > 1) {
      r2 = r2 * r2
    } else {
      r2 = abs(r2) * r2
    }

    const d = r1 * (r2 + 1.0 / varInfo.weight)
    if (d === 0) {
      return vec2f(pos)
    }
    const r = 1.0 / d
    return vec2f(pos.mul(r))
  },
)
