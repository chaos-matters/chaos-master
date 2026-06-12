import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG5Params = struct({
  sepx: f32,
  sepy: f32,
  stepx: f32,
})
type SymNetG5Params = Infer<typeof SymNetG5Params>
const SymNetG5ParamsDefaults: SymNetG5Params = {
  sepx: 0.0,
  sepy: 0.0,
  stepx: 0.0,
}
const SymNetG5ParamsEditor: EditorFor<SymNetG5Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'sepx', 'Sep X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'sepy', 'Sep Y')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
  </>
)

export const symNetG5 = parametricVariation(
  'symNetG5Var',
  SymNetG5Params,
  SymNetG5ParamsDefaults,
  SymNetG5ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const band = f32(floor(random() * 4.0))
    const hx = P.stepx * 0.5
    if (band < 1.0) {
      return vec2f(pos.x - P.sepx - 2.0 - hx, pos.y + P.sepy - 0.5).mul(
        varInfo.weight,
      )
    }
    if (band < 2.0) {
      return vec2f(-pos.x + P.sepx - hx, -pos.y - P.sepy - 0.5).mul(
        varInfo.weight,
      )
    }
    if (band < 3.0) {
      return vec2f(pos.x - P.sepx + hx, -pos.y - P.sepy - 0.5).mul(
        varInfo.weight,
      )
    }
    return vec2f(-pos.x + P.sepx + 2.0 + hx, pos.y + P.sepy - 0.5).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
