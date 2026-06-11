import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type HenonVarParams = Infer<typeof HenonVarParams>
const HenonVarParams = struct({
  a: f32,
  b: f32,
})

const HenonVarParamsDefaults: HenonVarParams = {
  a: 1.4,
  b: 0.3,
}

const HenonVarParamsEditor: EditorFor<HenonVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={0}
      max={1}
      step={0.01}
    />
  </>
)

export const henonVar = parametricVariation(
  'henonVar',
  HenonVarParams,
  HenonVarParamsDefaults,
  HenonVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const nx = 1.0 - P.a * pos.x * pos.x + pos.y
    const ny = P.b * pos.x
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
