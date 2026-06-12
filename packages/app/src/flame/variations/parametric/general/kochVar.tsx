import { f32, struct, vec2f } from 'typegpu/data'
import { fract } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type KochVarParams = Infer<typeof KochVarParams>
const KochVarParams = struct({
  iterations: f32,
})

const KochVarParamsDefaults: KochVarParams = {
  iterations: 4,
}

const KochVarParamsEditor: EditorFor<KochVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'iterations', 'Iterations')}
      min={1}
      max={8}
      step={1}
    />
  </>
)

const S3 = 0.2886751345948129

export const kochVar = parametricVariation(
  'kochVar',
  KochVarParams,
  KochVarParamsDefaults,
  KochVarParamsEditor,
  (pos, varInfo, _P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const sc = 1.0 / 3.0
    const nx = sc * x
    const ny = sc * y
    const seg = fract((x * 0.5 + y * 0.3 + 2.0) * 4.0)

    if (seg < 0.25) {
      return vec2f(nx, ny).mul(varInfo.weight)
    }
    if (seg < 0.5) {
      const s60 = 0.8660254037844386
      const c60 = 0.5
      return vec2f(c60 * nx - s60 * ny + sc, s60 * nx + c60 * ny).mul(
        varInfo.weight,
      )
    }
    if (seg < 0.75) {
      const s60 = 0.8660254037844386
      const c60 = 0.5
      return vec2f(c60 * nx + s60 * ny + 0.5, -s60 * nx + c60 * ny + S3).mul(
        varInfo.weight,
      )
    }
    return vec2f(nx + 2.0 * sc, ny).mul(varInfo.weight)
  },
  'general',
)
