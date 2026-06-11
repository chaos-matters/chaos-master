import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const FluxVarParams = struct({
  spread: f32,
})

type FluxVarParams = Infer<typeof FluxVarParams>

const FluxVarParamsDefaults: FluxVarParams = {
  spread: 0.3,
}

const FluxVarParamsEditor: EditorFor<FluxVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'spread', 'Spread', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
  </>
)

export const fluxVar = parametricVariation(
  'fluxVar',
  FluxVarParams,
  FluxVarParamsDefaults,
  FluxVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const w = varInfo.weight
    const xpw = pos.x + w
    const xmw = pos.x - w

    const sq1 = sqrt(pos.y * pos.y + xpw * xpw)
    const sq2 = sqrt(pos.y * pos.y + xmw * xmw)
    const avgr = abs(w * (2.0 + P.spread)) * sqrt(abs(sq1 / sq2))
    const avga = (atan2(pos.y, xmw) - atan2(pos.y, xpw)) * 0.5

    return vec2f(avgr * cos(avga), avgr * sin(avga))
  },
  'general',
)
