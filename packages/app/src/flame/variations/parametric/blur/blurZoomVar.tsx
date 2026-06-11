import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BlurZoomVarParams = struct({
  length: f32,
  x: f32,
  y: f32,
})
type BlurZoomVarParams = Infer<typeof BlurZoomVarParams>
const BlurZoomVarParamsDefaults: BlurZoomVarParams = {
  length: 0.24,
  x: 0.0,
  y: 0.0,
}
const BlurZoomVarParamsEditor: EditorFor<BlurZoomVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'length', 'Length')}
      min={0}
      max={1}
      step={0.01}
    />
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
  </>
)
export const blurZoomVar = parametricVariation(
  'blurZoomVar',
  BlurZoomVarParams,
  BlurZoomVarParamsDefaults,
  BlurZoomVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const z = 1.0 + P.length * random()
    const newX = varInfo.weight * ((pos.x - P.x) * z + P.x)
    const newY = varInfo.weight * ((pos.y + P.y) * z - P.y) // Note: +y then -y in Java code
    return vec2f(newX, newY)
  },
  'blur',
)
