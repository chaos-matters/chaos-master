import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, exp, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const OscilloscopeVarParams = struct({
  separation: f32,
  frequency: f32,
  amplitude: f32,
  damping: f32,
})

type OscilloscopeVarParams = Infer<typeof OscilloscopeVarParams>

const OscilloscopeVarParamsDefaults: OscilloscopeVarParams = {
  separation: 1.0,
  frequency: PI.$,
  amplitude: 1.0,
  damping: 0.0,
}

const OscilloscopeVarParamsEditor: EditorFor<OscilloscopeVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(
        props,
        'separation',
        'Separation',
        props.dataParameterPath,
      )}
      min={0}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'frequency', 'Frequency', props.dataParameterPath)}
      min={0}
      max={20}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'amplitude', 'Amplitude', props.dataParameterPath)}
      min={0}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'damping', 'Damping', props.dataParameterPath)}
      min={0}
      max={2}
      step={0.01}
    />
  </>
)

export const oscilloscopeVar = parametricVariation(
  'oscilloscopeVar',
  OscilloscopeVarParams,
  OscilloscopeVarParamsDefaults,
  OscilloscopeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const tpf = 2.0 * PI.$ * P.frequency
    const t =
      P.amplitude * exp(-abs(pos.x) * P.damping) * cos(tpf * pos.x) +
      P.separation
    const ySign = select(-pos.y, pos.y, abs(pos.y) <= t)
    return vec2f(pos.x, ySign).mul(varInfo.weight)
  },
  'general',
)
