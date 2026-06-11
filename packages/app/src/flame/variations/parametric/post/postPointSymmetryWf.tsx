import { f32, struct, vec2f } from 'typegpu/data'
import { cos, floor, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PostPointSymmetryWfParams = struct({
  centre_x: f32,
  centre_y: f32,
  order: f32,
})
type PostPointSymmetryWfParams = Infer<typeof PostPointSymmetryWfParams>
const PostPointSymmetryWfParamsDefaults: PostPointSymmetryWfParams = {
  centre_x: 0.25,
  centre_y: 0.5,
  order: 3,
}
const PostPointSymmetryWfParamsEditor: EditorFor<PostPointSymmetryWfParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'centre_x', 'Centre X')}
      min={-5}
      max={5}
    />
    <RangeEditor
      {...editorProps(props, 'centre_y', 'Centre Y')}
      min={-5}
      max={5}
    />
    <RangeEditor
      {...editorProps(props, 'order', 'Order')}
      min={1}
      max={20}
      step={1}
    />
  </>
)

export const postPointSymmetryWf = parametricVariation(
  'postPointSymmetryWfVar',
  PostPointSymmetryWfParams,
  PostPointSymmetryWfParamsDefaults,
  PostPointSymmetryWfParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const dx = (pos.x - P.centre_x) * varInfo.weight
    const dy = (pos.y - P.centre_y) * varInfo.weight
    const idx = f32(floor(random() * P.order))
    const angle = (idx * 2.0 * PI.$) / P.order
    const c = cos(angle)
    const s = sin(angle)
    const nx = P.centre_x + dx * c + dy * s
    const ny = P.centre_y + dy * c - dx * s
    return vec2f(nx, ny)
  },
  'post',
)
