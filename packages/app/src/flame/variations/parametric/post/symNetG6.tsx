import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG6Params = struct({
  sepy: f32,
  stepx: f32,
  stepy: f32,
})
type SymNetG6Params = Infer<typeof SymNetG6Params>
const SymNetG6ParamsDefaults: SymNetG6Params = {
  sepy: 0.1,
  stepx: 1.0,
  stepy: 1.0,
}
const SymNetG6ParamsEditor: EditorFor<SymNetG6Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'sepy', 'Sep Y')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symNetG6 = parametricVariation(
  'symNetG6Var',
  SymNetG6Params,
  SymNetG6ParamsDefaults,
  SymNetG6ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const hx = P.stepx * 0.5
    const hy = P.stepy * 0.5
    const sy2 = P.sepy * 0.5
    const band = f32(floor(random() * 4.0))
    if (band < 1.0) {
      return vec2f(pos.x - hx, pos.y - hy + sy2).mul(varInfo.weight)
    }
    if (band < 2.0) {
      return vec2f(pos.x - hx, pos.y - hy - sy2).mul(varInfo.weight)
    }
    if (band < 3.0) {
      return vec2f(pos.x + hx, pos.y + hy + sy2).mul(varInfo.weight)
    }
    return vec2f(pos.x + hx, pos.y + hy - sy2).mul(varInfo.weight)
  },
  'symmetry',
)
