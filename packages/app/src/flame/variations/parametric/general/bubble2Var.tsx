import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Bubble2VarParams = struct({
  x: f32,
  y: f32,
  z: f32,
})
type Bubble2VarParams = Infer<typeof Bubble2VarParams>
const Bubble2VarParamsDefaults: Bubble2VarParams = {
  x: 1.0,
  y: 1.0,
  z: 0.0,
}
const Bubble2VarParamsEditor: EditorFor<Bubble2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'X')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'z', 'Z')}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)
export const bubble2Var = parametricVariation(
  'bubble2Var',
  Bubble2VarParams,
  Bubble2VarParamsDefaults,
  Bubble2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const T = (pos.x * pos.x + pos.y * pos.y) * 0.25 + 1.0
    const r = varInfo.weight / T
    return vec2f(pos.x + pos.x * r * P.x, pos.y + pos.y * r * P.y)
  },
  'general',
)
