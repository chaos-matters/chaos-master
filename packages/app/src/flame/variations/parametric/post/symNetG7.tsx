import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG7Params = struct({
  sepx: f32,
  sepy: f32,
})
type SymNetG7Params = Infer<typeof SymNetG7Params>
const SymNetG7ParamsDefaults: SymNetG7Params = {
  sepx: 0.0,
  sepy: 0.0,
}
const SymNetG7ParamsEditor: EditorFor<SymNetG7Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'sepx', 'Sep X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'sepy', 'Sep Y')} min={-5} max={5} />
  </>
)

export const symNetG7 = parametricVariation(
  'symNetG7Var',
  SymNetG7Params,
  SymNetG7ParamsDefaults,
  SymNetG7ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    if (random() < 0.5) {
      return vec2f(pos.x - P.sepx * 0.5, pos.y + P.sepy * 0.5).mul(
        varInfo.weight,
      )
    }
    return vec2f(pos.x + P.sepx * 0.5, -pos.y - P.sepy * 0.5).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
