import { f32, struct, vec2f } from 'typegpu/data'
import { fract } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type GosperVarParams = Infer<typeof GosperVarParams>
const GosperVarParams = struct({
  iterations: f32,
})

const GosperVarParamsDefaults: GosperVarParams = {
  iterations: 4,
}

const GosperVarParamsEditor: EditorFor<GosperVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'iterations', 'Iterations')}
      min={1}
      max={8}
      step={1}
    />
  </>
)

const S7 = 1.0 / 7.0

export const gosperVar = parametricVariation(
  'gosperVar',
  GosperVarParams,
  GosperVarParamsDefaults,
  GosperVarParamsEditor,
  (pos, varInfo, _P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const seg = fract((x + y) * 0.7 + 0.5)

    if (seg < S7) {
      return vec2f(
        x * 0.5 - y * 0.2886751345948129,
        x * 0.2886751345948129 + y * 0.5,
      ).mul(varInfo.weight)
    }
    if (seg < 2.0 * S7) {
      return vec2f(
        x * 0.5 + y * 0.2886751345948129,
        -x * 0.2886751345948129 + y * 0.5,
      ).mul(varInfo.weight)
    }
    if (seg < 3.0 * S7) {
      const nx = 0.5 * x - 0.2886751345948129 * y + 0.5
      const ny = 0.2886751345948129 * x + 0.5 * y
      return vec2f(nx, ny).mul(varInfo.weight)
    }
    if (seg < 4.0 * S7) {
      const nx = 0.5 * x + 0.2886751345948129 * y + 0.5
      const ny = -0.2886751345948129 * x + 0.5 * y
      return vec2f(nx, ny).mul(varInfo.weight)
    }
    if (seg < 5.0 * S7) {
      const nx = 0.5 * x - 0.2886751345948129 * y + 0.25
      const ny = 0.2886751345948129 * x + 0.5 * y + 0.144337567297406
      return vec2f(nx, ny).mul(varInfo.weight)
    }
    if (seg < 6.0 * S7) {
      const nx = 0.5 * x + 0.2886751345948129 * y + 0.25
      const ny = -0.2886751345948129 * x + 0.5 * y + 0.144337567297406
      return vec2f(nx, ny).mul(varInfo.weight)
    }
    const nx = 0.5 * x
    const ny = 0.5 * y + 0.5773502691896258
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
