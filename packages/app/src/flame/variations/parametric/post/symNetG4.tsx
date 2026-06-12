import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG4Params = struct({
  sepx: f32,
  sepy: f32,
  stepx: f32,
  stepy: f32,
})
type SymNetG4Params = Infer<typeof SymNetG4Params>
const SymNetG4ParamsDefaults: SymNetG4Params = {
  sepx: 0.0,
  sepy: 0.0,
  stepx: 0.0,
  stepy: 0.0,
}
const SymNetG4ParamsEditor: EditorFor<SymNetG4Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'sepx', 'Sep X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'sepy', 'Sep Y')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symNetG4 = parametricVariation(
  'symNetG4Var',
  SymNetG4Params,
  SymNetG4ParamsDefaults,
  SymNetG4ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sx = P.sepx * 0.5
    const sy = P.sepy * 0.5
    const hx = P.stepx * 0.5
    const hy = P.stepy * 0.5
    const band = f32(floor(random() * 4.0))
    if (band < 1.0) {
      return vec2f(pos.x - sx - 2.0 - hx, pos.y + sy - 1.5 - hy).mul(
        varInfo.weight,
      )
    }
    if (band < 2.0) {
      return vec2f(-pos.x + sx - hx, -pos.y - sy - 0.5 - hy).mul(varInfo.weight)
    }
    if (band < 3.0) {
      return vec2f(pos.x - sx + hx, -pos.y - sy + 0.5 + hy).mul(varInfo.weight)
    }
    return vec2f(-pos.x + sx + 2.0 + hx, pos.y + sy - 0.5 + hy).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
