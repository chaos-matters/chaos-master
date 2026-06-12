import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG2Params = struct({
  stepx: f32,
  stepy: f32,
})
type SymNetG2Params = Infer<typeof SymNetG2Params>
const SymNetG2ParamsDefaults: SymNetG2Params = {
  stepx: 2.0,
  stepy: 2.0,
}
const SymNetG2ParamsEditor: EditorFor<SymNetG2Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symNetG2 = parametricVariation(
  'symNetG2Var',
  SymNetG2Params,
  SymNetG2ParamsDefaults,
  SymNetG2ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    if (random() < 0.5) {
      return vec2f(pos.x - P.stepx * 0.5, pos.y - P.stepy * 0.5).mul(
        varInfo.weight,
      )
    }
    return vec2f(pos.x + P.stepx * 0.5, -pos.y + P.stepy * 0.5).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
