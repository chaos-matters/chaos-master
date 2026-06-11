import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PostCurlParams = struct({
  c1: f32,
  c2: f32,
})
type PostCurlParams = Infer<typeof PostCurlParams>
const PostCurlParamsDefaults: PostCurlParams = {
  c1: 0.0,
  c2: 0.0,
}
const PostCurlParamsEditor: EditorFor<PostCurlParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'c1', 'C1')} min={-3} max={3} />
    <RangeEditor {...editorProps(props, 'c2', 'C2')} min={-3} max={3} />
  </>
)

export const postCurl = parametricVariation(
  'postCurlVar',
  PostCurlParams,
  PostCurlParamsDefaults,
  PostCurlParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const a = P.c1 * varInfo.weight
    const b = P.c2 * varInfo.weight
    const b22 = 2.0 * b
    const x = pos.x
    const y = pos.y
    const re = 1.0 + a * x + b * (x * x - y * y)
    const im = a * y + b22 * x * y
    const r = re * re + im * im + 0.000001
    const nx = (x * re + y * im) / r
    const ny = (y * re - x * im) / r
    return vec2f(nx, ny)
  },
  'post',
)
