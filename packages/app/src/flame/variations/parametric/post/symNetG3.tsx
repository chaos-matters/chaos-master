import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG3Params = struct({
  sepx: f32,
  sepy: f32,
  step: f32,
})
type SymNetG3Params = Infer<typeof SymNetG3Params>
const SymNetG3ParamsDefaults: SymNetG3Params = {
  sepx: 0.5,
  sepy: 0.0,
  step: 2.0,
}
const SymNetG3ParamsEditor: EditorFor<SymNetG3Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'sepx', 'Sep X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'sepy', 'Sep Y')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'step', 'Step')} min={-5} max={5} />
  </>
)

export const symNetG3 = parametricVariation(
  'symNetG3Var',
  SymNetG3Params,
  SymNetG3ParamsDefaults,
  SymNetG3ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const s = P.step * 0.5
    if (random() < 0.5) {
      return vec2f(pos.x - P.sepx - s, pos.y - P.sepy - s).mul(varInfo.weight)
    }
    return vec2f(-pos.x + P.sepx + s, -pos.y + P.sepy + s).mul(varInfo.weight)
  },
  'symmetry',
)
