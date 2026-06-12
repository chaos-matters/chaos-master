import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymBandG4Params = struct({
  stepx: f32,
  stepy: f32,
})
type SymBandG4Params = Infer<typeof SymBandG4Params>
const SymBandG4ParamsDefaults: SymBandG4Params = {
  stepx: 0.0,
  stepy: 0.0,
}
const SymBandG4ParamsEditor: EditorFor<SymBandG4Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symBandG4 = parametricVariation(
  'symBandG4Var',
  SymBandG4Params,
  SymBandG4ParamsDefaults,
  SymBandG4ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    if (random() < 0.5) {
      return vec2f(
        pos.x - P.stepx * 0.5 - 1.0,
        pos.y - P.stepy * 0.5 - 0.5,
      ).mul(varInfo.weight)
    }
    return vec2f(-pos.x + P.stepx * 0.5 + 1.0, pos.y + P.stepy * 0.5 + 0.5).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
