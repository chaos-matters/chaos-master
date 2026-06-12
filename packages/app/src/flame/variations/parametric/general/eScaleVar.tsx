import { f32, struct, vec2f } from 'typegpu/data'
import { acos, acosh, clamp, cos, cosh, max, select, sin, sinh, sqrt, } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const EScaleVarParams = struct({
  scale: f32,
  angle: f32,
})

type EScaleVarParams = Infer<typeof EScaleVarParams>

const EScaleVarParamsDefaults: EScaleVarParams = {
  scale: 1.0,
  angle: 0.0,
}

const EScaleVarParamsEditor: EditorFor<EScaleVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale', props.dataParameterPath)}
      min={0.01}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle', props.dataParameterPath)}
      min={0}
      max={PI.$ * 2}
      step={0.01}
    />
  </>
)

export const eScaleVar = parametricVariation(
  'eScaleVar',
  EScaleVarParams,
  EScaleVarParamsDefaults,
  EScaleVarParamsEditor,
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

    mu = mu * P.scale
    nu =
      (((P.scale * (nu + PI.$ + P.angle)) % (2.0 * PI.$ * P.scale)) -
        P.angle -
        P.scale * PI.$) %
      (2.0 * PI.$)
    nu = select(nu, nu - 2.0 * PI.$, nu > PI.$)
    nu = select(nu, nu + 2.0 * PI.$, nu < -PI.$)

    return vec2f(cosh(mu) * cos(nu), sinh(mu) * sin(nu)).mul(varInfo.weight)
  },
  'general',
)
