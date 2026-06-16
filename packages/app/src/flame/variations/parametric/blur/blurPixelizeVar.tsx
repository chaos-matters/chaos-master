import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
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
    // Pixelize: snap the point to the centre of its size×size grid cell.
    const cx = f32(floor(pos.x * inv_size)) * P.size + P.size * 0.5
    const cy = f32(floor(pos.y * inv_size)) * P.size + P.size * 0.5
    // Blur: jitter uniformly within the cell, widened by `scale`.
    const jitter = P.size * P.scale
    return vec2f(
      cx + jitter * (0.5 - random()),
      cy + jitter * (0.5 - random()),
    ).mul(varInfo.weight)
  },
  'blur',
)
