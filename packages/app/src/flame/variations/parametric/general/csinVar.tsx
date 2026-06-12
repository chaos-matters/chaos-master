import { f32, struct, vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CSinVarParams = struct({
  stretch: f32,
})
type CSinVarParams = Infer<typeof CSinVarParams>
const CSinVarParamsDefaults: CSinVarParams = {
  stretch: 1.5,
}
const CSinVarParamsEditor: EditorFor<CSinVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'stretch', 'Stretch')}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)
export const csinVar = parametricVariation(
  'csinVar',
  CSinVarParams,
  CSinVarParamsDefaults,
  CSinVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sx = pos.x * P.stretch
    const sy = pos.y * P.stretch
    const re = sin(sx) * cosh(sy)
    const im = cos(sx) * sinh(sy)
    const newX = varInfo.weight * re
    const newY = varInfo.weight * im
    return vec2f(newX, newY)
  },
  'general',
)
