import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, floor, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CropPolygonParams = struct({
  sides: f32,
  radius: f32,
  angle: f32,
})
type CropPolygonParams = Infer<typeof CropPolygonParams>
const CropPolygonParamsDefaults: CropPolygonParams = {
  sides: 6,
  radius: 1.0,
  angle: 0.0,
}
const CropPolygonParamsEditor: EditorFor<CropPolygonParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'sides', 'Sides')}
      min={3}
      max={20}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius')}
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

export const cropPolygonVar = parametricVariation(
  'cropPolygonVar',
  CropPolygonParams,
  CropPolygonParamsDefaults,
  CropPolygonParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const n = f32(floor(P.sides))
    const a = atan2(pos.y, pos.x) - P.angle
    const sector = a / ((2.0 * PI.$) / n)
    const frac = sector - floor(sector)
    const angleInSector = (frac * 2.0 * PI.$) / n - PI.$ / n
    const polyR = (P.radius * cos(PI.$ / n)) / cos(angleInSector)
    if (r > polyR) {
      return vec2f(0.0, 0.0).mul(varInfo.weight)
    }
    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'crop',
)
