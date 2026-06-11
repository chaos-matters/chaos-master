import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const AnamorphCylVarParams = struct({
  a: f32,
  b: f32,
  k: f32,
})
type AnamorphCylVarParams = Infer<typeof AnamorphCylVarParams>
const AnamorphCylVarParamsDefaults: AnamorphCylVarParams = {
  a: 1.0,
  b: 1.3,
  k: 3.0,
}
const AnamorphCylVarParamsEditor: EditorFor<AnamorphCylVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'k', 'K')}
      min={0}
      max={10}
      step={0.01}
    />
  </>
)
export const anamorphCylVar = parametricVariation(
  'anamorphCylVar',
  AnamorphCylVarParams,
  AnamorphCylVarParamsDefaults,
  AnamorphCylVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xt = P.a * (pos.y + P.b) * cos(P.k * pos.x)
    const yt = P.a * (pos.y + P.b) * sin(P.k * pos.x)
    const newX = xt * varInfo.weight
    const newY = yt * varInfo.weight
    return vec2f(newX, newY)
  },
  'general',
)
