import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, cosh, log, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BModVarParams = struct({
  radius: f32,
  distance: f32,
})

type BModVarParams = Infer<typeof BModVarParams>

const BModVarParamsDefaults: BModVarParams = {
  radius: 1.0,
  distance: 0.0,
}

const BModVarParamsEditor: EditorFor<BModVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'distance', 'Distance', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={0.01}
    />
  </>
)

export const bmodVar = parametricVariation(
  'bmodVar',
  BModVarParams,
  BModVarParamsDefaults,
  BModVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xp1 = pos.x + 1.0
    const xm1 = pos.x - 1.0
    let tau =
      0.5 * (log(xp1 * xp1 + pos.y * pos.y) - log(xm1 * xm1 + pos.y * pos.y))
    const sigma = PI.$ - atan2(pos.y, xp1) - atan2(pos.y, 1.0 - pos.x)

    if (tau > -P.radius && tau < P.radius) {
      tau =
        ((tau + P.radius + P.distance * P.radius) % (2.0 * P.radius)) - P.radius
    }

    const sinht = sinh(tau)
    const cosht = cosh(tau)
    const sins = sin(sigma)
    const coss = cos(sigma)
    const temp = cosht - coss

    if (temp === 0.0) {
      return vec2f(0.0).mul(varInfo.weight)
    }

    return vec2f(sinht / temp, sins / temp).mul(varInfo.weight)
  },
  'general',
)
