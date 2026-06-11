import { f32, struct, vec2f } from 'typegpu/data'
import { acos, acosh, clamp, cos, cosh, max, select, sin, sinh, sqrt, } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ESwirlVarParams = struct({
  in_: f32,
  out: f32,
})

type ESwirlVarParams = Infer<typeof ESwirlVarParams>

const ESwirlVarParamsDefaults: ESwirlVarParams = {
  in_: 1.2,
  out: 0.2,
}

const ESwirlVarParamsEditor: EditorFor<ESwirlVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'in_', 'In', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'out', 'Out', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const eSwirlVar = parametricVariation(
  'eSwirlVar',
  ESwirlVarParams,
  ESwirlVarParamsDefaults,
  ESwirlVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const tmp = pos.y * pos.y + pos.x * pos.x + 1.0
    const tmp2 = 2.0 * pos.x
    const xmax = max(
      (sqrt(max(tmp + tmp2, 0.0)) + sqrt(max(tmp - tmp2, 0.0))) * 0.5,
      1.0,
    )
    const mu = acosh(xmax)
    const t = clamp(pos.x / xmax, -1.0, 1.0)
    let nu = acos(t)
    nu = select(nu, -nu, pos.y < 0.0)

    nu = nu + mu * P.out + P.in_ / mu

    return vec2f(cosh(mu) * cos(nu), sinh(mu) * sin(nu)).mul(varInfo.weight)
  },
  'general',
)
