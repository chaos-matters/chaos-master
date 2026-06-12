import { f32, struct, vec2f } from 'typegpu/data'
import { exp } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PreGaussianParams = struct({
  sigma: f32,
})
type PreGaussianParams = Infer<typeof PreGaussianParams>
const PreGaussianParamsDefaults: PreGaussianParams = {
  sigma: 0.5,
}
const PreGaussianParamsEditor: EditorFor<PreGaussianParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'sigma', 'Sigma')} min={0.01} max={5} />
  </>
)

export const preGaussianVar = parametricVariation(
  'preGaussianVar',
  PreGaussianParams,
  PreGaussianParamsDefaults,
  PreGaussianParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const s = P.sigma
    const r2 = pos.x * pos.x + pos.y * pos.y
    const e = exp(-r2 / (2.0 * s * s))
    const x = pos.x * e
    const y = pos.y * e
    return vec2f(x, y).mul(varInfo.weight)
  },
  'pre',
)
