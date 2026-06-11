import { f32, struct, vec2f } from 'typegpu/data'
import { abs } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type LoziVarParams = Infer<typeof LoziVarParams>
const LoziVarParams = struct({
  a: f32,
  b: f32,
})

const LoziVarParamsDefaults: LoziVarParams = {
  a: 1.7,
  b: 0.5,
}

const LoziVarParamsEditor: EditorFor<LoziVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={0.5}
      max={2.5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={0.1}
      max={1.0}
      step={0.01}
    />
  </>
)

export const loziVar = parametricVariation(
  'loziVar',
  LoziVarParams,
  LoziVarParamsDefaults,
  LoziVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const nx = 1.0 - P.a * abs(pos.x) + pos.y
    const ny = P.b * pos.x
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
