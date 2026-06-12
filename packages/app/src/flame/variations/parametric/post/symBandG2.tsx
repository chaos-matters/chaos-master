import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymBandG2Params = struct({
  stepx: f32,
  stepy: f32,
})
type SymBandG2Params = Infer<typeof SymBandG2Params>
const SymBandG2ParamsDefaults: SymBandG2Params = {
  stepx: 0.0,
  stepy: 0.0,
}
const SymBandG2ParamsEditor: EditorFor<SymBandG2Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symBandG2 = parametricVariation(
  'symBandG2Var',
  SymBandG2Params,
  SymBandG2ParamsDefaults,
  SymBandG2ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    if (random() < 0.5) {
      return vec2f(pos.x - P.stepx * 0.5 - 1.0, pos.y - P.stepy * 0.5).mul(
        varInfo.weight,
      )
    }
    return vec2f(pos.x + P.stepx * 0.5, -pos.y + P.stepy * 0.5 + 1.0).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
