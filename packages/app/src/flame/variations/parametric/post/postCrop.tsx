import { f32, struct, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PostCropParams = struct({
  left: f32,
  right: f32,
  top: f32,
  bottom: f32,
  scatter_area: f32,
  zero: f32,
})
type PostCropParams = Infer<typeof PostCropParams>
const PostCropParamsDefaults: PostCropParams = {
  left: -1.0,
  right: 1.0,
  top: -1.0,
  bottom: 1.0,
  scatter_area: 0.0,
  zero: 0,
}
const PostCropParamsEditor: EditorFor<PostCropParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'left', 'Left')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'right', 'Right')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'top', 'Top')} min={-5} max={5} />
    <RangeEditor {...editorProps(props, 'bottom', 'Bottom')} min={-5} max={5} />
    <RangeEditor
      {...editorProps(props, 'scatter_area', 'Scatter Area')}
      min={-1}
      max={1}
    />
    <RangeEditor
      {...editorProps(props, 'zero', 'Zero')}
      min={0}
      max={1}
      step={1}
    />
  </>
)

export const postCrop = parametricVariation(
  'postCropVar',
  PostCropParams,
  PostCropParamsDefaults,
  PostCropParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xmin = f32(select(P.right, P.left, P.left < P.right))
    const xmax = f32(select(P.right, P.left, P.left > P.right))
    const ymin = f32(select(P.bottom, P.top, P.top < P.bottom))
    const ymax = f32(select(P.bottom, P.top, P.top > P.bottom))
    const w = (xmax - xmin) * 0.5 * P.scatter_area
    const h = (ymax - ymin) * 0.5 * P.scatter_area

    let x = pos.x
    let y = pos.y

    const outsideX = x < xmin || x > xmax
    const outsideY = y < ymin || y > ymax

    if (outsideX || outsideY) {
      if (P.zero > 0.5) {
        return vec2f(0.0, 0.0).mul(varInfo.weight)
      }
      if (x < xmin) {
        x = xmin + random() * w
      }
      if (x > xmax) {
        x = xmax - random() * w
      }
      if (y < ymin) {
        y = ymin + random() * h
      }
      if (y > ymax) {
        y = ymax - random() * h
      }
    }

    return vec2f(x, y).mul(varInfo.weight)
  },
  'post',
)
