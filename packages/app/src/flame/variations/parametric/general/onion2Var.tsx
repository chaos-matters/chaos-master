import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, exp, select, sin, sqrt, tan } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Onion2VarParams = struct({
  meeting_pt: f32,
  top_crop: f32,
  circle_a: f32,
  circle_b: f32,
})
type Onion2VarParams = Infer<typeof Onion2VarParams>
const Onion2VarParamsDefaults: Onion2VarParams = {
  meeting_pt: 0.0,
  top_crop: 0.0,
  circle_a: 1.0,
  circle_b: 1.0,
}
const Onion2VarParamsEditor: EditorFor<Onion2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'meeting_pt', ' Meeting Pt ')}
      min={-5}
      max={5}
    />
    <RangeEditor
      {...editorProps(props, 'top_crop', ' Top Crop ')}
      min={0}
      max={5}
    />
    <RangeEditor
      {...editorProps(props, 'circle_a', ' Circle A ')}
      min={0}
      max={5}
    />
    <RangeEditor
      {...editorProps(props, 'circle_b', ' Circle B ')}
      min={0}
      max={5}
    />
  </>
)
export const onion2Var = parametricVariation(
  'onion2Var',
  Onion2VarParams,
  Onion2VarParamsDefaults,
  Onion2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r_pre = sqrt(pos.x * pos.x + pos.y * pos.y)
    const t = 2.0 * atan2(pos.y, pos.x) + PI.$ * 0.5
    const tan_meet = tan(P.meeting_pt)
    const cos_meet = cos(P.meeting_pt)
    const sin_meet = sin(P.meeting_pt)
    const cos_t = cos(t)
    let r_1 = cos_t
    let z_1 = f32(0.0)
    const safe_tan = select(tan_meet, 1.0e-9, tan_meet === 0.0)
    const term = exp(cos_meet - r_1) / safe_tan + sin_meet - 1.0 / safe_tan
    z_1 = term
    const isCropped = z_1 > P.top_crop && P.top_crop > 0.0
    z_1 = select(z_1, P.top_crop, isCropped)
    r_1 = select(r_1, 0.0, isCropped)
    const z_1_zero = P.top_crop
    z_1 = select(z_1_zero, z_1, tan_meet !== 0.0)
    const r_2 = cos_t
    const cond = t > P.meeting_pt
    let r = select(r_2, r_1, cond)
    r *= P.circle_a * varInfo.weight
    const len = select(r_pre, 1.0e-9, r_pre === 0.0)
    const newX = r * (pos.x / len)
    const newY = r * (pos.y / len)
    return vec2f(newX, newY)
  },
  'general',
)
