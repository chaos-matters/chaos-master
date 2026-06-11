import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CropRhombusParams = struct({
  width: f32,
  height: f32,
  angle: f32,
})
type CropRhombusParams = Infer<typeof CropRhombusParams>
const CropRhombusParamsDefaults: CropRhombusParams = {
  width: 1.0,
  height: 1.0,
  angle: 0.0,
}
const CropRhombusParamsEditor: EditorFor<CropRhombusParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'width', 'Width')} min={0.01} max={4} />
    <RangeEditor
      {...editorProps(props, 'height', 'Height')}
      min={0.01}
      max={4}
    />
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle')}
      min={0}
      max={6.2832}
    />
  </>
)

export const cropRhombusVar = parametricVariation(
  'cropRhombusVar',
  CropRhombusParams,
  CropRhombusParamsDefaults,
  CropRhombusParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const ca = cos(P.angle)
    const sa = sin(P.angle)
    const rx = pos.x * ca - pos.y * sa
    const ry = pos.x * sa + pos.y * ca
    const hw = P.width * 0.5
    const hh = P.height * 0.5
    const d = abs(rx) / hw + abs(ry) / hh
    if (d > 1.0) {
      return vec2f(0.0, 0.0).mul(varInfo.weight)
    }
    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'crop',
)
