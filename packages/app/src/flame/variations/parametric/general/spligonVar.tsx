import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, floor, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SpligonVarParams = struct({
  sides: f32,
  r: f32,
  i: f32,
})

type SpligonVarParams = Infer<typeof SpligonVarParams>

const SpligonVarParamsDefaults: SpligonVarParams = {
  sides: 3.0,
  r: 1.0,
  i: 1.0,
}

const SpligonVarParamsEditor: EditorFor<SpligonVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'sides', 'Sides', props.dataParameterPath)}
      min={2.0}
      max={100.0}
      step={1.0}
    />
    <RangeEditor
      {...editorProps(props, 'r', 'Radius', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'i', 'Index', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
  </>
)

export const spligonVar = parametricVariation(
  'spligonVar',
  SpligonVarParams,
  SpligonVarParamsDefaults,
  SpligonVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const a = atan2(pos.y, pos.x)
    const th = P.sides / (2.0 * PI.$)
    const j = (-PI.$ * P.i) / (2.0 * P.sides)
    const t = floor(a * th) / th + j
    const dx = sin(t)
    const dy = cos(t)

    return vec2f(pos.x + dy * P.r, pos.y + dx * P.r).mul(varInfo.weight)
  },
  'general',
)
