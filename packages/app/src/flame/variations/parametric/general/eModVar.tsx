import { f32, struct, vec2f } from 'typegpu/data'
import { abs, acos, acosh, clamp, cos, cosh, floor, max, select, sin, sinh, sqrt, } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const EModVarParams = struct({
  radius: f32,
  distance: f32,
})

type EModVarParams = Infer<typeof EModVarParams>

const EModVarParamsDefaults: EModVarParams = {
  radius: 1.0,
  distance: 0.0,
}

const EModVarParamsEditor: EditorFor<EModVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'distance', 'Distance', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const eModVar = parametricVariation(
  'eModVar',
  EModVarParams,
  EModVarParamsDefaults,
  EModVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const tmp = pos.y * pos.y + pos.x * pos.x + 1.0
    const tmp2 = 2.0 * pos.x
    const xmax = max(
      (sqrt(max(tmp + tmp2, 0.0)) + sqrt(max(tmp - tmp2, 0.0))) * 0.5,
      1.0,
    )
    let mu = acosh(xmax)
    const t = clamp(pos.x / xmax, -1.0, 1.0)
    let nu = acos(t)
    nu = select(nu, -nu, pos.y < 0.0)

    if (abs(mu) < P.radius) {
      const drad = P.distance * P.radius
      const twoR = 2.0 * P.radius
      mu = select(
        mu - drad - twoR * floor((mu - P.radius - drad) / twoR),
        mu + drad - twoR * floor((mu + P.radius + drad) / twoR),
        nu > 0.0,
      )
    }

    return vec2f(cosh(mu) * cos(nu), sinh(mu) * sin(nu)).mul(varInfo.weight)
  },
  'general',
)
