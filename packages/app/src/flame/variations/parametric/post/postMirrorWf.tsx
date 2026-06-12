import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PostMirrorWfParams = struct({
  xaxis: f32,
  yaxis: f32,
  xshift: f32,
  yshift: f32,
  xscale: f32,
  yscale: f32,
})
type PostMirrorWfParams = Infer<typeof PostMirrorWfParams>
const PostMirrorWfParamsDefaults: PostMirrorWfParams = {
  xaxis: 1,
  yaxis: 0,
  xshift: 0.0,
  yshift: 0.0,
  xscale: 1.0,
  yscale: 1.0,
}
const PostMirrorWfParamsEditor: EditorFor<PostMirrorWfParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'xaxis', 'X Axis')}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'yaxis', 'Y Axis')}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'xshift', 'X Shift')}
      min={-2}
      max={2}
    />
    <RangeEditor
      {...editorProps(props, 'yshift', 'Y Shift')}
      min={-2}
      max={2}
    />
    <RangeEditor
      {...editorProps(props, 'xscale', 'X Scale')}
      min={-2}
      max={2}
    />
    <RangeEditor
      {...editorProps(props, 'yscale', 'Y Scale')}
      min={-2}
      max={2}
    />
  </>
)

export const postMirrorWf = parametricVariation(
  'postMirrorWfVar',
  PostMirrorWfParams,
  PostMirrorWfParamsDefaults,
  PostMirrorWfParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let x = pos.x
    let y = pos.y

    if (P.xaxis > 0.5 && random() < 0.5) {
      x = P.xscale * (-pos.x - P.xshift)
      y = P.yscale * pos.y
    }
    if (P.yaxis > 0.5 && random() < 0.5) {
      x = P.xscale * pos.x
      y = P.yscale * (-pos.y - P.yshift)
    }

    return vec2f(x, y).mul(varInfo.weight)
  },
  'post',
)
