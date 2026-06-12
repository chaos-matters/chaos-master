import { f32, struct, vec2f } from 'typegpu/data'
import { acos, acosh, clamp, cos, cosh, max, select, sin, sinh, sqrt, } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const EPushVarParams = struct({
  push: f32,
  dist: f32,
  rotate: f32,
})

type EPushVarParams = Infer<typeof EPushVarParams>

const EPushVarParamsDefaults: EPushVarParams = {
  push: 0.0,
  dist: 1.0,
  rotate: 0.0,
}

const EPushVarParamsEditor: EditorFor<EPushVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'push', 'Push', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'dist', 'Dist', props.dataParameterPath)}
      min={0.01}
      max={10.0}
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

export const ePushVar = parametricVariation(
  'ePushVar',
  EPushVarParams,
  EPushVarParamsDefaults,
  EPushVarParamsEditor,
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
    mu = mu * P.dist + P.push * PI.$

    if (mu <= 0.0) {
      mu = -mu
      nu = -nu
    }

    return vec2f(cosh(mu) * cos(nu), sinh(mu) * sin(nu)).mul(varInfo.weight)
  },
  'general',
)
