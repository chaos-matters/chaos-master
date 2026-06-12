import { f32, struct, vec2f } from 'typegpu/data'
import { cos, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PostAxisSymmetryWfParams = struct({
  axis: f32,
  centre_x: f32,
  centre_y: f32,
  rotation: f32,
})
type PostAxisSymmetryWfParams = Infer<typeof PostAxisSymmetryWfParams>
const PostAxisSymmetryWfParamsDefaults: PostAxisSymmetryWfParams = {
  axis: 0,
  centre_x: 0.0,
  centre_y: 0.0,
  rotation: 0.0,
}
const PostAxisSymmetryWfParamsEditor: EditorFor<PostAxisSymmetryWfParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'axis', 'Axis')}
      min={0}
      max={1}
      step={1}
    />
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
      {...editorProps(props, 'rotation', 'Rotation')}
      min={-360}
      max={360}
    />
  </>
)

export const postAxisSymmetryWf = parametricVariation(
  'postAxisSymmetryWfVar',
  PostAxisSymmetryWfParams,
  PostAxisSymmetryWfParamsDefaults,
  PostAxisSymmetryWfParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const halfAngle = (P.rotation * 3.14159265359) / 360.0
    const doRotate = halfAngle !== 0.0
    const halfDist = varInfo.weight / 2.0

    const branch = random() < 0.5
    const sign = select(f32(-1.0), f32(1.0), branch)

    let nx = pos.x
    let ny = pos.y

    if (P.axis < 0.5) {
      // axis X
      const dx = pos.x - P.centre_x
      nx = P.centre_x + sign * dx + sign * halfDist
      ny = pos.y
    } else {
      // axis Y
      const dy = pos.y - P.centre_y
      nx = pos.x
      ny = P.centre_y + sign * dy + sign * halfDist
    }

    if (doRotate) {
      const dcx = nx - P.centre_x
      const dcy = ny - P.centre_y
      const c = cos(halfAngle)
      const s = sin(halfAngle)
      const rotS = sign * s
      nx = P.centre_x + dcx * c + dcy * rotS
      ny = P.centre_y + dcy * c - dcx * rotS
    }

    return vec2f(nx, ny)
  },
  'post',
)
