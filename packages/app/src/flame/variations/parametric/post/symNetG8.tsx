import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG8Params = struct({
  skewx: f32,
  skewy: f32,
  sepx: f32,
  sepy: f32,
})
type SymNetG8Params = Infer<typeof SymNetG8Params>
const SymNetG8ParamsDefaults: SymNetG8Params = {
  skewx: 0.0,
  skewy: 0.0,
  sepx: 0.0,
  sepy: 0.0,
}
const SymNetG8ParamsEditor: EditorFor<SymNetG8Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'skewx', 'Skew X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'skewy', 'Skew Y')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'sepx', 'Sep X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'sepy', 'Sep Y')} min={-5} max={5} />
  </>
)

export const symNetG8 = parametricVariation(
  'symNetG8Var',
  SymNetG8Params,
  SymNetG8ParamsDefaults,
  SymNetG8ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sx = P.sepx * 0.5
    const sy = P.sepy * 0.5
    const kx = P.skewx * 0.5
    const ky = P.skewy * 0.5
    const band = f32(floor(random() * 8.0))
    if (band < 2.0) {
      if (band < 1.0) {
        return vec2f(pos.x - 1.0 - sx - kx, -pos.y - sy - ky).mul(
          varInfo.weight,
        )
      }
      return vec2f(-pos.x + 1.0 + sx - kx, pos.y + sy - ky).mul(varInfo.weight)
    }
    if (band < 4.0) {
      if (band < 3.0) {
        return vec2f(-pos.x + 1.0 + sx - kx, -pos.y - sy - ky).mul(
          varInfo.weight,
        )
      }
      return vec2f(pos.x - 1.0 - sx - kx, pos.y + sy - ky).mul(varInfo.weight)
    }
    if (band < 6.0) {
      if (band < 5.0) {
        return vec2f(pos.x - 1.0 - sx + kx, -pos.y - sy + ky).mul(
          varInfo.weight,
        )
      }
      return vec2f(-pos.x + 1.0 + sx + kx, pos.y + sy + ky).mul(varInfo.weight)
    }
    if (band < 7.0) {
      return vec2f(-pos.x + 1.0 + sx + kx, -pos.y - sy + ky).mul(varInfo.weight)
    }
    return vec2f(pos.x - 1.0 - sx + kx, pos.y + sy + ky).mul(varInfo.weight)
  },
  'symmetry',
)
