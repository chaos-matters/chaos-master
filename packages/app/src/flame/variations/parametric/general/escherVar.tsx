import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, exp, log, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const EscherVarParams = struct({
  beta: f32,
})

type EscherVarParams = Infer<typeof EscherVarParams>

const EscherVarParamsDefaults: EscherVarParams = {
  beta: 0.3,
}

const EscherVarParamsEditor: EditorFor<EscherVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'beta', 'Beta', props.dataParameterPath)}
      min={-1.0}
      max={1.0}
      step={0.01}
    />
  </>
)

export const escherVar = parametricVariation(
  'escherVar',
  EscherVarParams,
  EscherVarParamsDefaults,
  EscherVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const a = atan2(y, x)
    const lnr = 0.5 * log(x * x + y * y + 0.000001)
    const n = sin(P.beta * PI.$) * a
    const m = cos(P.beta * PI.$) * lnr
    return vec2f(cos(n) * exp(m), sin(n) * exp(m)).mul(varInfo.weight)
  },
  'general',
)
