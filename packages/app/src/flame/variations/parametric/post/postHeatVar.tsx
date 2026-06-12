import { f32, struct, vec2f } from 'typegpu/data'
import { sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PostHeatParams = struct({
  amount: f32,
  scale: f32,
})
type PostHeatParams = Infer<typeof PostHeatParams>
const PostHeatParamsDefaults: PostHeatParams = {
  amount: 0.5,
  scale: 10.0,
}
const PostHeatParamsEditor: EditorFor<PostHeatParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'amount', 'Amount')} min={0} max={2} />
    <RangeEditor {...editorProps(props, 'scale', 'Scale')} min={0.1} max={50} />
  </>
)

export const postHeatVar = parametricVariation(
  'postHeatVar',
  PostHeatParams,
  PostHeatParamsDefaults,
  PostHeatParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const n = sin(pos.x * P.scale) * sin(pos.y * P.scale) * P.amount
    const x = pos.x + (random() - 0.5) * n
    const y = pos.y + (random() - 0.5) * n
    return vec2f(x, y).mul(varInfo.weight)
  },
  'post',
)
