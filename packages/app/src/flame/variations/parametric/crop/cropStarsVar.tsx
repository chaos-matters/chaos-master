import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, floor, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CropStarsParams = struct({
  points: f32,
  inner: f32,
  outer: f32,
})
type CropStarsParams = Infer<typeof CropStarsParams>
const CropStarsParamsDefaults: CropStarsParams = {
  points: 5,
  inner: 0.4,
  outer: 1.0,
}
const CropStarsParamsEditor: EditorFor<CropStarsParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'points', 'Points')}
      min={2}
      max={20}
      step={1}
    />
    <RangeEditor {...editorProps(props, 'inner', 'Inner')} min={0.01} max={3} />
    <RangeEditor {...editorProps(props, 'outer', 'Outer')} min={0.01} max={3} />
  </>
)

export const cropStarsVar = parametricVariation(
  'cropStarsVar',
  CropStarsParams,
  CropStarsParamsDefaults,
  CropStarsParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const n = f32(floor(P.points))
    const angle = atan2(pos.y, pos.x)
    const sector = angle / ((2.0 * PI.$) / n)
    const frac = sector - floor(sector)
    const phase = select((1.0 - frac) * 2.0, frac * 2.0, frac < 0.5)
    const starR = P.inner + (P.outer - P.inner) * phase
    if (r > starR) {
      return vec2f(0.0, 0.0).mul(varInfo.weight)
    }
    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'crop',
)
