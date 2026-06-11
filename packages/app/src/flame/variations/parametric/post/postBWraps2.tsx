import { f32, struct, vec2f } from 'typegpu/data'
import { cos, floor, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PostBWraps2Params = struct({
  cellsize: f32,
  space: f32,
  gain: f32,
  inner_twist: f32,
  outer_twist: f32,
})
type PostBWraps2Params = Infer<typeof PostBWraps2Params>
const PostBWraps2ParamsDefaults: PostBWraps2Params = {
  cellsize: 1.0,
  space: 0.0,
  gain: 2.0,
  inner_twist: 0.0,
  outer_twist: 0.0,
}
const PostBWraps2ParamsEditor: EditorFor<PostBWraps2Params> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'cellsize', 'Cell Size')}
      min={0.01}
      max={5}
    />
    <RangeEditor {...editorProps(props, 'space', 'Space')} min={-1} max={1} />
    <RangeEditor {...editorProps(props, 'gain', 'Gain')} min={0.1} max={10} />
    <RangeEditor
      {...editorProps(props, 'inner_twist', 'Inner Twist')}
      min={-6.28}
      max={6.28}
    />
    <RangeEditor
      {...editorProps(props, 'outer_twist', 'Outer Twist')}
      min={-6.28}
      max={6.28}
    />
  </>
)

export const postBWraps2 = parametricVariation(
  'postBWraps2Var',
  PostBWraps2Params,
  PostBWraps2ParamsDefaults,
  PostBWraps2ParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const space2 = P.space * P.space
    const radius = (0.5 * P.cellsize) / (1.0 + space2)
    const g2 = (P.gain * P.gain) / P.cellsize + 0.000001
    let max_bubble = g2 * radius
    if (max_bubble > 2.0) {
      max_bubble = 1.0
    } else {
      const mb2 = max_bubble * max_bubble * 0.25
      max_bubble = max_bubble / (mb2 + 1.0)
    }
    const r2 = radius * radius
    const rfactor = radius / max_bubble

    const cx = (floor(pos.x / P.cellsize) + 0.5) * P.cellsize
    const cy = (floor(pos.y / P.cellsize) + 0.5) * P.cellsize
    let lx = pos.x - cx
    let ly = pos.y - cy

    if (lx * lx + ly * ly <= r2) {
      lx = lx * g2
      ly = ly * g2
      const r = rfactor / (lx * lx * 0.25 + ly * ly * 0.25 + 1.0)
      lx = lx * r
      ly = ly * r
      const nr = (lx * lx + ly * ly) / r2
      const theta = P.inner_twist * (1.0 - nr) + P.outer_twist * nr
      const s = sin(theta)
      const c = cos(theta)
      const nx = cx + c * lx + s * ly
      const ny = cy - s * lx + c * ly
      return vec2f(nx, ny).mul(varInfo.weight)
    }

    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'post',
)
