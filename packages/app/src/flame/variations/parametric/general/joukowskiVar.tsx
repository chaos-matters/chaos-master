import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type JoukowskiVarParams = Infer<typeof JoukowskiVarParams>
const JoukowskiVarParams = struct({
  thickness: f32,
})

const JoukowskiVarParamsDefaults: JoukowskiVarParams = {
  thickness: 0.2,
}

const JoukowskiVarParamsEditor: EditorFor<JoukowskiVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'thickness', 'Thickness')}
      min={0.01}
      max={1.0}
      step={0.01}
    />
  </>
)

export const joukowskiVar = parametricVariation(
  'joukowskiVar',
  JoukowskiVarParams,
  JoukowskiVarParamsDefaults,
  JoukowskiVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x + P.thickness
    const y = pos.y
    const r2 = x * x + y * y + 0.000001
    const a2 = P.thickness * P.thickness
    const nx = x * (1.0 + a2 / r2)
    const ny = y * (1.0 - a2 / r2)
    return vec2f(nx * 0.5, ny * 0.5).mul(varInfo.weight)
  },
  'general',
)
