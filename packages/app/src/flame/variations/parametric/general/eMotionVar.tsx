import { f32, struct, vec2f } from 'typegpu/data'
import { acos, acosh, clamp, cos, cosh, max, select, sin, sinh, sqrt, } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const EMotionVarParams = struct({
  offset: f32,
  rotate: f32,
})

type EMotionVarParams = Infer<typeof EMotionVarParams>

const EMotionVarParamsDefaults: EMotionVarParams = {
  offset: 0.0,
  rotate: 0.0,
}

const EMotionVarParamsEditor: EditorFor<EMotionVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'offset', 'Offset', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rotate', 'Rotate', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const eMotionVar = parametricVariation(
  'eMotionVar',
  EMotionVarParams,
  EMotionVarParamsDefaults,
  EMotionVarParamsEditor,
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

    nu += P.rotate * PI.$
    mu += select(-P.offset * PI.$, P.offset * PI.$, nu > 0.0)

    if (mu <= 0.0) {
      mu = -mu
      nu = -nu
    }

    return vec2f(cosh(mu) * cos(nu), sinh(mu) * sin(nu)).mul(varInfo.weight)
  },
  'general',
)
