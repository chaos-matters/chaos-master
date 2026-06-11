import { f32, struct, vec2f } from 'typegpu/data'
import { sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type SquircularVarParams = Infer<typeof SquircularVarParams>
const SquircularVarParams = struct({
  n: f32,
})

const SquircularVarParamsDefaults: SquircularVarParams = {
  n: 4,
}

const SquircularVarParamsEditor: EditorFor<SquircularVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'n', 'N')}
      min={1}
      max={10}
      step={0.1}
    />
  </>
)

export const squircularVar = parametricVariation(
  'squircularVar',
  SquircularVarParams,
  SquircularVarParamsDefaults,
  SquircularVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const r = sqrt(x * x + y * y + 0.000001)
    const theta = (x + y) / r
    const nr = r / sqrt(1.0 + (r * r) / (P.n * P.n + 0.01))
    return vec2f(nr * theta, nr * (1.0 - theta * theta)).mul(varInfo.weight)
  },
  'general',
)
