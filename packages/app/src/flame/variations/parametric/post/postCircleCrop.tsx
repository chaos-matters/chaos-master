import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type PostCircleCropParams = Infer<typeof PostCircleCropParams>
const PostCircleCropParams = struct({
  radius: f32,
  x: f32,
  y: f32,
  scatter_area: f32,
  zero: f32,
})

const PostCircleCropParamsDefaults: PostCircleCropParams = {
  radius: 1.0,
  x: 0,
  y: 0,
  scatter_area: 0,
  zero: 1.0,
}

const PostCircleCropParamsEditor: EditorFor<PostCircleCropParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x', 'Center X')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Center Y')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scatter_area', 'Scatter Area')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'zero', 'Zero Outside')}
      min={0}
      max={1}
      step={1}
    />
  </>
)

export const postCircleCrop = parametricVariation(
  'postCircleCropVar',
  PostCircleCropParams,
  PostCircleCropParamsDefaults,
  PostCircleCropParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const px = pos.x - P.x
    const py = pos.y - P.y
    const rad = sqrt(px * px + py * py)
    const vv = varInfo.weight
    const esc = rad > P.radius

    if (P.zero > 0.5) {
      if (esc) {
        return vec2f(0, 0)
      }
      return vec2f(vv * px + P.x, vv * py + P.y)
    }

    if (esc) {
      const ang = atan2(py, px)
      const rdc = P.radius + random() * 0.5 * P.scatter_area
      return vec2f(vv * rdc * cos(ang) + P.x, vv * rdc * sin(ang) + P.y)
    }
    return vec2f(vv * px + P.x, vv * py + P.y)
  },
  'post',
)
