import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type MacMillanParams = Infer<typeof MacMillanParams>
const MacMillanParams = struct({
  a: f32,
  b: f32,
})

const MacMillanDefaults: MacMillanParams = {
  a: 1.6,
  b: 0.4,
}

const MacMillanEditor: EditorFor<MacMillanParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={-3}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={-1}
      max={1}
      step={0.01}
    />
  </>
)

export const macMillanVar = parametricVariation(
  'macMillanVar',
  MacMillanParams,
  MacMillanDefaults,
  MacMillanEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.y
    const y = -pos.x + 2.0 * P.a * (pos.y / (1.0 + pos.y * pos.y)) + P.b * pos.y
    const xn = y
    const yn = -x + 2.0 * P.a * (y / (1.0 + y * y)) + P.b * y
    return vec2f(xn, yn).mul(varInfo.weight)
  },
  'general',
)
