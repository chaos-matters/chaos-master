import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, exp, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Oscilloscope2VarParams = struct({
  separation: f32,
  frequencyx: f32,
  frequencyy: f32,
  amplitude: f32,
  perturbation: f32,
  damping: f32,
})

type Oscilloscope2VarParams = Infer<typeof Oscilloscope2VarParams>

const Oscilloscope2VarParamsDefaults: Oscilloscope2VarParams = {
  separation: 1.0,
  frequencyx: PI.$,
  frequencyy: PI.$,
  amplitude: 1.0,
  perturbation: 1.0,
  damping: 0.0,
}

const Oscilloscope2VarParamsEditor: EditorFor<Oscilloscope2VarParams> = (
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
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'frequencyx', 'Freq X', props.dataParameterPath)}
      min={0}
      max={20}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'frequencyy', 'Freq Y', props.dataParameterPath)}
      min={0}
      max={20}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'amplitude', 'Amplitude', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(
        props,
        'perturbation',
        'Perturbation',
        props.dataParameterPath,
      )}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'damping', 'Damping', props.dataParameterPath)}
      min={0}
      max={5}
      step={0.01}
    />
  </>
)

export const oscilloscope2Var = parametricVariation(
  'oscilloscope2Var',
  Oscilloscope2VarParams,
  Oscilloscope2VarParamsDefaults,
  Oscilloscope2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const tpf = 2.0 * PI.$ * P.frequencyx
    const tpf2 = 2.0 * PI.$ * P.frequencyy
    const pt = P.perturbation * sin(tpf2 * pos.y)
    const noDamping = abs(P.damping) <= EPS.$
    const tDamped =
      P.amplitude * exp(-abs(pos.x) * P.damping) * cos(tpf * pos.x + pt) +
      P.separation
    const tSimple = P.amplitude * cos(tpf * pos.x + pt) + P.separation
    const t = select(tDamped, tSimple, noDamping)
    if (abs(pos.y) <= t) {
      return vec2f(-pos.x, -pos.y).mul(varInfo.weight)
    }
    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'general',
)
