import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG11Params = struct({
  space: f32,
  spacex: f32,
  spacey: f32,
  stepx: f32,
  stepy: f32,
})
type SymNetG11Params = Infer<typeof SymNetG11Params>
const SymNetG11ParamsDefaults: SymNetG11Params = {
  space: 0.0,
  spacex: 0.0,
  spacey: 0.0,
  stepx: 1.5,
  stepy: 1.5,
}
const SymNetG11ParamsEditor: EditorFor<SymNetG11Params> = (props) => (
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
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symNetG11 = parametricVariation(
  'symNetG11Var',
  SymNetG11Params,
  SymNetG11ParamsDefaults,
  SymNetG11ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const hx = P.stepx * 0.5
    const hy = P.stepy * 0.5
    const band = f32(floor(random() * 8.0))
    if (band < 2.0) {
      if (band < 1.0) {
        return vec2f(pos.x + P.spacex + hx, pos.y + P.spacey + hy).mul(
          varInfo.weight,
        )
      }
      return vec2f(-pos.x - P.spacex + hx, -pos.y - P.spacey + hy).mul(
        varInfo.weight,
      )
    }
    if (band < 4.0) {
      if (band < 3.0) {
        return vec2f(pos.y + P.spacex + hx, -pos.x - P.spacey + hy).mul(
          varInfo.weight,
        )
      }
      return vec2f(-pos.y - P.spacex + hx, pos.x + P.spacey + hy).mul(
        varInfo.weight,
      )
    }
    if (band < 6.0) {
      if (band < 5.0) {
        return vec2f(-pos.x - P.spacex - hx, pos.y + P.spacey - hy).mul(
          varInfo.weight,
        )
      }
      return vec2f(-pos.y - P.spacex - hx, -pos.x - P.spacey - hy).mul(
        varInfo.weight,
      )
    }
    if (band < 7.0) {
      return vec2f(pos.y + P.spacex - hx, pos.x + P.spacey - hy).mul(
        varInfo.weight,
      )
    }
    return vec2f(pos.x + P.spacex - hx, -pos.y - P.spacey - hy).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
