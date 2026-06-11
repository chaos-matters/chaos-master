import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const GumowskiMiraVarParams = struct({
  a: f32,
  b: f32,
  m: f32,
})

type GumowskiMiraVarParams = Infer<typeof GumowskiMiraVarParams>

const GumowskiMiraVarParamsDefaults: GumowskiMiraVarParams = {
  a: 0.000001,
  b: 0.05,
  m: -0.08,
}

const GumowskiMiraVarParamsEditor: EditorFor<GumowskiMiraVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={-0.0001}
      max={0.0001}
      step={0.000001}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B', props.dataParameterPath)}
      min={0}
      max={1}
      step={0.001}
    />
    <RangeEditor
      {...editorProps(props, 'm', 'M', props.dataParameterPath)}
      min={-1}
      max={1}
      step={0.001}
    />
  </>
)

export const gumowskiMiraVar = parametricVariation(
  'gumowskiMiraVar',
  GumowskiMiraVarParams,
  GumowskiMiraVarParamsDefaults,
  GumowskiMiraVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x2 = pos.x * pos.x
    const mira_x = P.m * pos.x + (2.0 * (1.0 - P.m) * x2) / (1.0 + x2)
    const xn = pos.y + P.a * (1.0 - P.b * pos.y * pos.y) * pos.y + mira_x
    const xn2 = xn * xn
    const mira_xn = P.m * xn + (2.0 * (1.0 - P.m) * xn2) / (1.0 + xn2)
    const yn = -pos.x + mira_xn
    return vec2f(xn, yn).mul(varInfo.weight)
  },
  'general',
)
