import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CannabisCurveVarParams = struct({
  filled: f32,
})

type CannabisCurveVarParams = Infer<typeof CannabisCurveVarParams>

const CannabisCurveVarParamsDefaults: CannabisCurveVarParams = {
  filled: 0.85,
}

const CannabisCurveVarParamsEditor: EditorFor<CannabisCurveVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'filled', 'Filled', props.dataParameterPath)}
      min={0}
      max={1}
      step={0.01}
    />
  </>
)

export const cannabisCurveVar = parametricVariation(
  'cannabisCurveVar',
  CannabisCurveVarParams,
  CannabisCurveVarParamsDefaults,
  CannabisCurveVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let a = atan2(pos.y, pos.x)
    let r =
      (1.0 + 0.9 * cos(8.0 * a)) *
      (1.0 + 0.1 * cos(24.0 * a)) *
      (0.9 + 0.1 * cos(200.0 * a)) *
      (1.0 + sin(a))
    if (P.filled > 0.0 && random() < P.filled) {
      r *= random()
    }
    a += PI.$ * 0.5
    return vec2f(sin(a) * r, cos(a) * r).mul(varInfo.weight)
  },
  'general',
)
