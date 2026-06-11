import { f32, struct, vec2f } from 'typegpu/data'
import { floor, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BlurPixelizeVarParams = struct({
  size: f32,
  scale: f32,
})
type BlurPixelizeVarParams = Infer<typeof BlurPixelizeVarParams>
const BlurPixelizeVarParamsDefaults: BlurPixelizeVarParams = {
  size: 0.1,
  scale: 1.0,
}
const BlurPixelizeVarParamsEditor: EditorFor<BlurPixelizeVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'size', 'Size')}
      min={0.01}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)
export const blurPixelizeVar = parametricVariation(
  'blurPixelizeVar',
  BlurPixelizeVarParams,
  BlurPixelizeVarParamsDefaults,
  BlurPixelizeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const inv_size = 1.0 / P.size
    const x0 = f32(floor(pos.x * inv_size))
    const y0 = f32(floor(pos.y * inv_size))
    const cx = x0 * P.size + P.size * 0.5
    const cy = y0 * P.size + P.size * 0.5
    const dx = pos.x - cx
    const dy = pos.y - cy
    const dist = sqrt(dx * dx + dy * dy)
    const v = varInfo.weight * P.size
    const delta = dist * P.scale * random() * v
    return vec2f(delta, delta) // Note: symmetric shift on X and Y based on code?
  },
  'blur',
)
