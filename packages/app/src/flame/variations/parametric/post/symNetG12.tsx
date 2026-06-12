import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG12Params = struct({
  space: f32,
  spacex: f32,
  spacey: f32,
})
type SymNetG12Params = Infer<typeof SymNetG12Params>
const SymNetG12ParamsDefaults: SymNetG12Params = {
  space: 0.0,
  spacex: 0.0,
  spacey: 0.0,
}
const SymNetG12ParamsEditor: EditorFor<SymNetG12Params> = (props) => (
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

export const symNetG12 = parametricVariation(
  'symNetG12Var',
  SymNetG12Params,
  SymNetG12ParamsDefaults,
  SymNetG12ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sx = P.spacex
    const sy = P.spacey
    const px = pos.x + P.space
    const py = pos.y + P.space
    const band = f32(floor(random() * 8.0))
    if (band < 2.0) {
      if (band < 1.0) {
        return vec2f(px + sx, py + sy).mul(varInfo.weight)
      }
      return vec2f(-px - sx, -py - sy).mul(varInfo.weight)
    }
    if (band < 4.0) {
      if (band < 3.0) {
        return vec2f(py + sx, -px - sy).mul(varInfo.weight)
      }
      return vec2f(-py - sx, px + sy).mul(varInfo.weight)
    }
    if (band < 6.0) {
      if (band < 5.0) {
        return vec2f(-px - sx, py + sy).mul(varInfo.weight)
      }
      return vec2f(-py - sx, -px - sy).mul(varInfo.weight)
    }
    if (band < 7.0) {
      return vec2f(py + sx, px + sy).mul(varInfo.weight)
    }
    return vec2f(px + sx, -py - sy).mul(varInfo.weight)
  },
  'symmetry',
)
