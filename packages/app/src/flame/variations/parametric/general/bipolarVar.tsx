import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, log } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BipolarVarParams = struct({
  shift: f32,
})

type BipolarVarParams = Infer<typeof BipolarVarParams>

const BipolarVarParamsDefaults: BipolarVarParams = {
  shift: 0.0,
}

const BipolarVarParamsEditor: EditorFor<BipolarVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'shift', 'Shift', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const bipolarVar = parametricVariation(
  'bipolarVar',
  BipolarVarParams,
  BipolarVarParamsDefaults,
  BipolarVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x2y2 = pos.x * pos.x + pos.y * pos.y
    const t = x2y2 + 1.0
    const x2 = 2.0 * pos.x
    const ps = (-PI.$ / 2.0) * P.shift
    let y = 0.5 * atan2(2.0 * pos.y, x2y2 - 1.0) + ps

    const halfPi = PI.$ / 2.0
    if (y > halfPi) {
      y = ((y + halfPi) % PI.$) - halfPi
    } else if (y < -halfPi) {
      y = ((y - halfPi) % PI.$) + halfPi
    }

    const f = t + x2
    const g = t - x2

    if (g === 0.0 || f / g <= 0.0) {
      return vec2f(0.0).mul(varInfo.weight)
    }

    const twoOverPi = 2.0 / PI.$
    return vec2f(0.25 * twoOverPi * log(f / g), twoOverPi * y).mul(
      varInfo.weight,
    )
  },
  'general',
)
