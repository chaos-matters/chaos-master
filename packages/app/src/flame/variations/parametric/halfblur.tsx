import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, pow, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type CannabisBlurParams = Infer<typeof CannabisBlurParams>
const CannabisBlurParams = struct({
  fill: f32,
})

const CannabisBlurParamsDefaults: CannabisBlurParams = {
  fill: 1,
}

const CannabisBlurParamsEditor: EditorFor<CannabisBlurParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'fill', 'Fill')}
      min={0}
      max={1}
      step={0.01}
    />
  </>
)

export const cannabisBlur = parametricVariation(
  'cannabisBlur',
  CannabisBlurParams,
  CannabisBlurParamsDefaults,
  CannabisBlurParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const theta = atan2(pos.y, pos.x)

    // Compute r_shape using detailed polar formula
    const term1 = 1 + 0.9 * cos(8 * theta)
    const term2 = 1 + 0.1 * cos(24 * theta)
    const term3 = 0.9 + 0.1 * cos(200 * theta)
    const term4 = 1 + sin(theta)
    const r_shape = term1 * term2 * term3 * term4 // Optionally normalize: / 2.0

    const scale = random()
    const r_blurred = pow(scale, P.fill) * r_shape // Or pow(scale, power) * r_shape for density control

    const u = varInfo.weight * r_blurred * cos(theta)
    const v = varInfo.weight * r_blurred * sin(theta)

    return vec2f(u, v)
  },
)
