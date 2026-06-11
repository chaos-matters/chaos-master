import { f32, struct, vec2f } from 'typegpu/data'
import { cos, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const XHeartVarParams = struct({
  angle: f32,
  ratio: f32,
})

type XHeartVarParams = Infer<typeof XHeartVarParams>

const XHeartVarParamsDefaults: XHeartVarParams = {
  angle: 0.0,
  ratio: 0.0,
}

const XHeartVarParamsEditor: EditorFor<XHeartVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle', props.dataParameterPath)}
      min={-3.14159}
      max={3.14159}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ratio', 'Ratio', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const xheartVar = parametricVariation(
  'xheartVar',
  XHeartVarParams,
  XHeartVarParamsDefaults,
  XHeartVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r2 = pos.x * pos.x + pos.y * pos.y + 4.0
    const bx = 4.0 / r2
    const by = P.ratio / r2
    const cosa = cos(P.angle)
    const sina = sin(P.angle)
    const x = cosa * bx * pos.x - sina * by * pos.y
    const y = sina * bx * pos.x + cosa * by * pos.y
    return vec2f(x, select(-y, y, x > 0.0)).mul(varInfo.weight)
  },
  'general',
)
