import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG1Params = struct({
  stepx: f32,
  stepy: f32,
})
type SymNetG1Params = Infer<typeof SymNetG1Params>
const SymNetG1ParamsDefaults: SymNetG1Params = {
  stepx: 0.5,
  stepy: 0.5,
}
const SymNetG1ParamsEditor: EditorFor<SymNetG1Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symNetG1 = parametricVariation(
  'symNetG1Var',
  SymNetG1Params,
  SymNetG1ParamsDefaults,
  SymNetG1ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    if (random() < 0.5) {
      return vec2f(pos.x - P.stepx * 0.5, pos.y - P.stepy * 0.5).mul(
        varInfo.weight,
      )
    }
    return vec2f(pos.x + P.stepx * 0.5, pos.y + P.stepy * 0.5).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
