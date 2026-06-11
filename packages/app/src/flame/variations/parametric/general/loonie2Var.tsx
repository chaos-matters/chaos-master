import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, max, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Loonie2VarParams = struct({
  sides: f32,
  star: f32,
  circle: f32,
})

type Loonie2VarParams = Infer<typeof Loonie2VarParams>

const Loonie2VarParamsDefaults: Loonie2VarParams = {
  sides: 4.0,
  star: 0.15,
  circle: 0.25,
}

const Loonie2VarParamsEditor: EditorFor<Loonie2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'sides', 'Sides', props.dataParameterPath)}
      min={1.0}
      max={50.0}
      step={1.0}
    />
    <RangeEditor
      {...editorProps(props, 'star', 'Star', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'circle', 'Circle', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const loonie2Var = parametricVariation(
  'loonie2Var',
  Loonie2VarParams,
  Loonie2VarParamsDefaults,
  Loonie2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const sqrvvar = f32(1.0)

    const a = (2.0 * PI.$) / P.sides
    const sina = sin(a)
    const cosa = cos(a)

    const starA = -PI.$ * 0.5 * P.star
    const sins = sin(starA)
    const coss = cos(starA)

    const circA = PI.$ * 0.5 * P.circle
    const sinc = sin(circA)
    const cosc = cos(circA)

    let xrt = pos.x
    let yrt = pos.y
    const circ = sqrt(xrt * xrt + yrt * yrt)

    let r2 = xrt * coss + abs(yrt) * sins

    for (let i = f32(0.0); i < P.sides - 1.0; i += 1.0) {
      const swp = xrt * cosa - yrt * sina
      yrt = xrt * sina + yrt * cosa
      xrt = swp
      r2 = max(r2, xrt * coss + abs(yrt) * sins)
    }

    const r2Adj = r2 * cosc + circ * sinc
    const r2Final = select(abs(r2Adj) * r2Adj, r2Adj * r2Adj, P.sides > 1.0)

    const resultR = select(
      select(
        1.0,
        1.0 / sqrt(max(abs(sqrvvar / r2Final) - 1.0, EPS.$)),
        r2Final < 0.0,
      ),
      sqrt(abs(sqrvvar / r2Final - 1.0)),
      r2Final > 0.0 && r2Final < sqrvvar,
    )

    return vec2f(resultR * pos.x, resultR * pos.y).mul(varInfo.weight)
  },
  'general',
)
