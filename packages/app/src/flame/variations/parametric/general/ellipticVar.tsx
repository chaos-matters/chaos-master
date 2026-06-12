import { f32, struct, vec2f } from 'typegpu/data'
import { asin, atan2, clamp, log, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { EPS, PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const EllipticVarParams = struct({
  mode: f32,
})

type EllipticVarParams = Infer<typeof EllipticVarParams>

const EllipticVarParamsDefaults: EllipticVarParams = {
  mode: 1.0,
}

const EllipticVarParamsEditor: EditorFor<EllipticVarParams> = (props) => (
  <RangeEditor
    {...editorProps(props, 'mode', 'Mode', props.dataParameterPath)}
    min={0}
    max={2}
    step={1}
  />
)

function ellipticSqrt1pm1(x: number) {
  'use gpu'
  if (x > -0.0625 && x < 0.0625) {
    return (
      (x * (0.5 + x * (0.75 + x * (0.3125 + x * 0.03125)))) /
      (1.0 + x * (1.75 + x * (0.9375 + x * (0.15625 + x * 0.00390625))))
    )
  }
  return sqrt(1.0 + x) - 1.0
}

const M2PI = 2.0 / PI.$

export const ellipticVar = parametricVariation(
  'ellipticVar',
  EllipticVarParams,
  EllipticVarParamsDefaults,
  EllipticVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x2 = 2.0 * pos.x
    const sq = pos.y * pos.y + pos.x * pos.x
    const mode = P.mode

    if (mode > 1.5) {
      const xmaxm1 =
        0.5 * (ellipticSqrt1pm1(sq + x2) + ellipticSqrt1pm1(sq - x2))
      const ssx = select(0.0, sqrt(xmaxm1), xmaxm1 >= 0.0)
      const a = pos.x / (1.0 + xmaxm1)
      const sign = select(f32(-1.0), f32(1.0), pos.y > 0.0)
      return vec2f(
        M2PI * asin(clamp(a, -1.0, 1.0)),
        sign * M2PI * log(xmaxm1 + ssx + 1.0),
      ).mul(varInfo.weight)
    }

    const tmp = sq + 1.0
    const xmax = 0.5 * (sqrt(tmp + x2) + sqrt(tmp - x2))
    const a = pos.x / xmax
    const b = select(0.0, sqrt(1.0 - a * a), 1.0 - a * a >= EPS.$)
    const ySign = select(f32(-1.0), f32(1.0), pos.y > 0.0)
    const sign = select(
      select(f32(-1.0), f32(1.0), random() < 0.5),
      ySign,
      mode < 0.5 || mode > 1.5,
    )
    return vec2f(
      M2PI * atan2(a, b),
      sign *
        M2PI *
        log(xmax + select(0.0, sqrt(xmax - 1.0), xmax - 1.0 >= EPS.$)),
    ).mul(varInfo.weight)
  },
  'general',
)
