import { f32, struct, vec2f } from 'typegpu/data'
import { acos, clamp, cos, max, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ERotateVarParams = struct({
  rotate: f32,
})

type ERotateVarParams = Infer<typeof ERotateVarParams>

const ERotateVarParamsDefaults: ERotateVarParams = {
  rotate: 0.0,
}

const ERotateVarParamsEditor: EditorFor<ERotateVarParams> = (props) => (
  <RangeEditor
    {...editorProps(props, 'rotate', 'Rotate', props.dataParameterPath)}
    min={0}
    max={PI.$ * 2}
    step={0.01}
  />
)

export const eRotateVar = parametricVariation(
  'eRotateVar',
  ERotateVarParams,
  ERotateVarParamsDefaults,
  ERotateVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const tmp = pos.y * pos.y + pos.x * pos.x + 1.0
    const tmp2 = 2.0 * pos.x
    const xmax = max(
      (sqrt(max(tmp + tmp2, 0.0)) + sqrt(max(tmp - tmp2, 0.0))) * 0.5,
      1.0,
    )
    const t = clamp(pos.x / xmax, -1.0, 1.0)
    let nu = acos(t)
    nu = select(nu, -nu, pos.y < 0.0)
    nu = ((nu + P.rotate + PI.$) % (2.0 * PI.$)) - PI.$
    return vec2f(
      xmax * cos(nu),
      sqrt(max(xmax - 1.0, 0.0)) * sqrt(max(xmax + 1.0, 0.0)) * sin(nu),
    ).mul(varInfo.weight)
  },
  'general',
)
