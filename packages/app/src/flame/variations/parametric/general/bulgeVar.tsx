import { f32, struct, vec2f } from 'typegpu/data'
import { length, pow } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BulgeVarParams = struct({
  N: f32,
})
type BulgeVarParams = Infer<typeof BulgeVarParams>
const BulgeVarParamsDefaults: BulgeVarParams = {
  N: 2.0,
}
const BulgeVarParamsEditor: EditorFor<BulgeVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'N', 'N')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)
export const bulgeVar = parametricVariation(
  'bulgeVar',
  BulgeVarParams,
  BulgeVarParamsDefaults,
  BulgeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r = length(pos)
    const rn = pow(r, P.N)
    const factor = varInfo.weight * (rn / (r + 1.0e-9))
    const newX = factor * pos.x
    const newY = factor * pos.y
    return vec2f(newX, newY)
  },
  'general',
)
