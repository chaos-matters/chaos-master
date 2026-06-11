import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymBandG7Params = struct({
  stepx: f32,
  stepy: f32,
})
type SymBandG7Params = Infer<typeof SymBandG7Params>
const SymBandG7ParamsDefaults: SymBandG7Params = {
  stepx: 0.0,
  stepy: 0.0,
}
const SymBandG7ParamsEditor: EditorFor<SymBandG7Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symBandG7 = parametricVariation(
  'symBandG7Var',
  SymBandG7Params,
  SymBandG7ParamsDefaults,
  SymBandG7ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const hx = P.stepx * 0.5
    const hy = P.stepy * 0.5
    const band = f32(floor(random() * 4.0))
    if (band < 1.0) {
      return vec2f(pos.x - hx - 2.0, pos.y - hy - 0.5).mul(varInfo.weight)
    }
    if (band < 2.0) {
      return vec2f(-pos.x + hx + 2.0, pos.y + hy - 0.5).mul(varInfo.weight)
    }
    if (band < 3.0) {
      return vec2f(pos.x + hx, -pos.y + hy + 0.5).mul(varInfo.weight)
    }
    return vec2f(-pos.x - hx, -pos.y - hy + 0.5).mul(varInfo.weight)
  },
  'symmetry',
)
