import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CropTriangleParams = struct({
  size: f32,
  angle: f32,
})
type CropTriangleParams = Infer<typeof CropTriangleParams>
const CropTriangleParamsDefaults: CropTriangleParams = {
  size: 1.0,
  angle: 0.0,
}
const CropTriangleParamsEditor: EditorFor<CropTriangleParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'size', 'Size')} min={0.01} max={4} />
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle')}
      min={0}
      max={6.2832}
    />
  </>
)

export const cropTriangleVar = parametricVariation(
  'cropTriangleVar',
  CropTriangleParams,
  CropTriangleParamsDefaults,
  CropTriangleParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const ca = cos(P.angle)
    const sa = sin(P.angle)
    const x = pos.x * ca - pos.y * sa
    const y = pos.x * sa + pos.y * ca
    const s = P.size
    const h = s * 0.8660254
    const inside =
      y > -h * 0.5 &&
      y < h &&
      (x * 2.0) / s + y / h < 1.0 &&
      (-x * 2.0) / s + y / h < 1.0
    if (!inside) {
      return vec2f(0.0, 0.0).mul(varInfo.weight)
    }
    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'crop',
)
