import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CropCrossParams = struct({
  width: f32,
  length: f32,
  angle: f32,
})
type CropCrossParams = Infer<typeof CropCrossParams>
const CropCrossParamsDefaults: CropCrossParams = {
  width: 0.3,
  length: 1.0,
  angle: 0.0,
}
const CropCrossParamsEditor: EditorFor<CropCrossParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'width', 'Width')} min={0.01} max={3} />
    <RangeEditor
      {...editorProps(props, 'length', 'Length')}
      min={0.01}
      max={3}
    />
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle')}
      min={0}
      max={6.2832}
    />
  </>
)

export const cropCrossVar = parametricVariation(
  'cropCrossVar',
  CropCrossParams,
  CropCrossParamsDefaults,
  CropCrossParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const ca = cos(P.angle)
    const sa = sin(P.angle)
    const x = pos.x * ca - pos.y * sa
    const y = pos.x * sa + pos.y * ca
    const hw = P.width * 0.5
    const hl = P.length * 0.5
    const inH = abs(x) < hl && abs(y) < hw
    const inV = abs(y) < hl && abs(x) < hw
    if (!inH && !inV) {
      return vec2f(0.0, 0.0).mul(varInfo.weight)
    }
    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'crop',
)
