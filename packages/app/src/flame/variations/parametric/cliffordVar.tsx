import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type CliffordVarParams = Infer<typeof CliffordVarParams>
const CliffordVarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
})

const CliffordVarParamsDefaults: CliffordVarParams = {
  a: -1.4,
  b: 1.6,
  c: 1.0,
  d: 0.7,
}

const CliffordVarParamsEditor: EditorFor<CliffordVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={-3}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B')}
      min={-3}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C')}
      min={-3}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D')}
      min={-3}
      max={3}
      step={0.01}
    />
  </>
)

export const cliffordVar = parametricVariation(
  'cliffordVar',
  CliffordVarParams,
  CliffordVarParamsDefaults,
  CliffordVarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y

    const nx = sin(P.a * y) + P.c * cos(P.a * x)
    const ny = sin(P.b * x) + P.d * cos(P.b * y)

    return vec2f(nx, ny)
  },
)
