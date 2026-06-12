import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, cosh, log, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BSwirlVarParams = struct({
  in: f32,
  out: f32,
})

type BSwirlVarParams = Infer<typeof BSwirlVarParams>

const BSwirlVarParamsDefaults: BSwirlVarParams = {
  in: 0.0,
  out: 0.0,
}

const BSwirlVarParamsEditor: EditorFor<BSwirlVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'in', 'In', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'out', 'Out', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const bswirlVar = parametricVariation(
  'bswirlVar',
  BSwirlVarParams,
  BSwirlVarParamsDefaults,
  BSwirlVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xp1 = pos.x + 1.0
    const xm1 = pos.x - 1.0
    const tau =
      0.5 * (log(xp1 * xp1 + pos.y * pos.y) - log(xm1 * xm1 + pos.y * pos.y))
    let sigma = PI.$ - atan2(pos.y, xp1) - atan2(pos.y, 1.0 - pos.x)

    sigma = sigma + tau * P.out + P.in / (tau + EPS.$)

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
