import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG10Params = struct({
  space: f32,
  spacex: f32,
  spacey: f32,
})
type SymNetG10Params = Infer<typeof SymNetG10Params>
const SymNetG10ParamsDefaults: SymNetG10Params = {
  space: 0.0,
  spacex: 0.0,
  spacey: 0.0,
}
const SymNetG10ParamsEditor: EditorFor<SymNetG10Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'space', 'Space')} min={-5} max={5} />
    <RangeEditor
      {...editorProps(props, 'spacex', 'Space X')}
      min={-5}
      max={5}
    />
    <RangeEditor
      {...editorProps(props, 'spacey', 'Space Y')}
      min={-5}
      max={5}
    />
  </>
)

export const symNetG10 = parametricVariation(
  'symNetG10Var',
  SymNetG10Params,
  SymNetG10ParamsDefaults,
  SymNetG10ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sx = P.spacex * 0.5
    const sy = P.spacey * 0.5
    const band = f32(floor(random() * 4.0))
    if (band < 1.0) {
      return vec2f(-pos.x - sx, -pos.y).mul(varInfo.weight)
    }
    if (band < 2.0) {
      return vec2f(pos.y, -pos.x - sy).mul(varInfo.weight)
    }
    if (band < 3.0) {
      return vec2f(-pos.y, pos.x + sy).mul(varInfo.weight)
    }
    return vec2f(pos.x + sx, pos.y).mul(varInfo.weight)
  },
  'symmetry',
)
