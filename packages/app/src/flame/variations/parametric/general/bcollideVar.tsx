import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, cosh, floor, log, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BCollideVarParams = struct({
  num: f32,
  a: f32,
})

type BCollideVarParams = Infer<typeof BCollideVarParams>

const BCollideVarParamsDefaults: BCollideVarParams = {
  num: 1.0,
  a: 0.0,
}

const BCollideVarParamsEditor: EditorFor<BCollideVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'num', 'Num', props.dataParameterPath)}
      min={1}
      max={20}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const bcollideVar = parametricVariation(
  'bcollideVar',
  BCollideVarParams,
  BCollideVarParamsDefaults,
  BCollideVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xp1 = pos.x + 1.0
    const xm1 = pos.x - 1.0
    const tau =
      0.5 * (log(xp1 * xp1 + pos.y * pos.y) - log(xm1 * xm1 + pos.y * pos.y))
    let sigma = PI.$ - atan2(pos.y, xp1) - atan2(pos.y, 1.0 - pos.x)

    const pi_bCn = PI.$ / P.num
    const bCa_bCn = (PI.$ * P.a) / P.num
    const alt = floor(sigma / pi_bCn)
    const even = alt % 2.0 < 0.5

    if (even) {
      sigma = alt * pi_bCn + ((sigma + bCa_bCn) % pi_bCn)
    } else {
      sigma = alt * pi_bCn + ((sigma - bCa_bCn) % pi_bCn)
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
