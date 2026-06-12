import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, pow, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Murl2VarParams = struct({
  c: f32,
  power: f32,
})
type Murl2VarParams = Infer<typeof Murl2VarParams>
const Murl2VarParamsDefaults: Murl2VarParams = {
  c: 0.1,
  power: 3.0,
}
const Murl2VarParamsEditor: EditorFor<Murl2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'c', 'C')}
      min={-1}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={-20}
      max={20}
      step={0.1}
    />
  </>
)
export const murl2Var = parametricVariation(
  'murl2Var',
  Murl2VarParams,
  Murl2VarParamsDefaults,
  Murl2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const p2 = P.power / 2.0
    const w = varInfo.weight

    const a = atan2(pos.y, pos.x) * P.power
    const sina = sin(a)
    const cosa = cos(a)
    const r = P.c * pow(pos.x * pos.x + pos.y * pos.y, p2)
    let re = r * cosa + 1.0
    let im = r * sina

    const r2 = re * re + im * im
    const invp = 1.0 / P.power
    const r3 = pow(r2, invp)
    const a2 = atan2(im, re) * 2.0 * invp
    re = r3 * cos(a2)
    im = r3 * sin(a2)

    const vp = w * pow(P.c + 1.0, 2.0 / P.power)
    const rl = vp / (r3 * r3)

    return vec2f(
      pos.x + rl * (pos.x * re + pos.y * im),
      pos.y + rl * (pos.y * re - pos.x * im),
    )
  },
  'general',
)
