import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG9Params = struct({
  sepx: f32,
  sepy: f32,
})
type SymNetG9Params = Infer<typeof SymNetG9Params>
const SymNetG9ParamsDefaults: SymNetG9Params = {
  sepx: 0.0,
  sepy: 0.0,
}
const SymNetG9ParamsEditor: EditorFor<SymNetG9Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'sepx', 'Sep X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'sepy', 'Sep Y')} min={-5} max={5} />
  </>
)

export const symNetG9 = parametricVariation(
  'symNetG9Var',
  SymNetG9Params,
  SymNetG9ParamsDefaults,
  SymNetG9ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sx = P.sepx * 0.5
    const sy = P.sepy * 0.5
    const band = f32(floor(random() * 4.0))
    if (band < 1.0) {
      return vec2f(pos.x + sx, -pos.y - sy).mul(varInfo.weight)
    }
    if (band < 2.0) {
      return vec2f(-pos.x - sx, pos.y + sy).mul(varInfo.weight)
    }
    if (band < 3.0) {
      return vec2f(-pos.x - sx, -pos.y - sy).mul(varInfo.weight)
    }
    return vec2f(pos.x + sx, pos.y + sy).mul(varInfo.weight)
  },
  'symmetry',
)
