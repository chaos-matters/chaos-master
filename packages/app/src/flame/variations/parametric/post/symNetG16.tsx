import { f32, struct, vec2f } from 'typegpu/data'
import { floor, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SymNetG16Params = struct({
  radius: f32,
  stepx: f32,
  stepy: f32,
})
type SymNetG16Params = Infer<typeof SymNetG16Params>
const SymNetG16ParamsDefaults: SymNetG16Params = {
  radius: 0.0,
  stepx: 0.0,
  stepy: 0.0,
}
const SymNetG16ParamsEditor: EditorFor<SymNetG16Params> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'radius', 'Radius')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepx', 'Step X')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'stepy', 'Step Y')} min={-5} max={5} />
  </>
)

export const symNetG16 = parametricVariation(
  'symNetG16Var',
  SymNetG16Params,
  SymNetG16ParamsDefaults,
  SymNetG16ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const sp = sqrt(P.radius * P.radius * 0.5)
    const px = pos.x + sp
    const py = pos.y + sp
    const hx = P.stepx * 0.5
    const hy = P.stepy * 0.5
    const band = f32(floor(random() * 12.0))
    const sign = select(f32(1.0), f32(-1.0), band < 6.0)
    const tx = sign * hx
    const ty = sign * hy
    const pattern = select(band, band - 6.0, band >= 6.0)
    if (pattern < 1.0) {
      return vec2f(px + tx, py + ty).mul(varInfo.weight)
    }
    if (pattern < 2.0) {
      return vec2f(0.5 * px - 0.866 * py + tx, 0.866 * px + 0.5 * py + ty).mul(
        varInfo.weight,
      )
    }
    if (pattern < 3.0) {
      return vec2f(-0.5 * px - 0.866 * py + tx, 0.866 * px - 0.5 * py + ty).mul(
        varInfo.weight,
      )
    }
    if (pattern < 4.0) {
      return vec2f(-px + tx, -py + ty).mul(varInfo.weight)
    }
    if (pattern < 5.0) {
      return vec2f(
        -0.5 * px + 0.866 * py + tx,
        -0.866 * px - 0.5 * py + ty,
      ).mul(varInfo.weight)
    }
    return vec2f(0.5 * px + 0.866 * py + tx, -0.866 * px + 0.5 * py + ty).mul(
      varInfo.weight,
    )
  },
  'symmetry',
)
