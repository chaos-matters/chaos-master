import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymBandG1Params = struct({
  stepx: f32,
  stepy: f32,
})
type SymBandG1Params = Infer<typeof SymBandG1Params>
const SymBandG1ParamsDefaults: SymBandG1Params = {
  stepx: 0.0,
  stepy: 0.0,
}
const SymBandG1ParamsEditor: EditorFor<SymBandG1Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symBandG1 = parametricVariation(
  'symBandG1Var',
  SymBandG1Params,
  SymBandG1ParamsDefaults,
  SymBandG1ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    if (random() < 0.5) {
      return vec2f(pos.x - P.stepx * 0.5 - 1.0, pos.y - P.stepy * 0.5).mul(
        varInfo.weight,
      )
    }
    return vec2f(pos.x + P.stepx * 0.5, pos.y + P.stepy * 0.5).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
