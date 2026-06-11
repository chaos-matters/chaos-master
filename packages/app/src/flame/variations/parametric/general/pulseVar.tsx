import { f32, struct, vec2f } from 'typegpu/data'
import { sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PulseVarParams = struct({
  freqx: f32,
  freqy: f32,
  scalex: f32,
  scaley: f32,
})

type PulseVarParams = Infer<typeof PulseVarParams>

const PulseVarParamsDefaults: PulseVarParams = {
  freqx: 2.0,
  freqy: 2.0,
  scalex: 1.0,
  scaley: 1.0,
}

const PulseVarParamsEditor: EditorFor<PulseVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'freqx', 'Freq X', props.dataParameterPath)}
      min={0}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'freqy', 'Freq Y', props.dataParameterPath)}
      min={0}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'scalex', 'Scale X', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scaley', 'Scale Y', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const pulseVar = parametricVariation(
  'pulseVar',
  PulseVarParams,
  PulseVarParamsDefaults,
  PulseVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    return vec2f(
      pos.x + pos.x + P.scalex * sin(pos.x * P.freqx),
      pos.y + pos.y + P.scaley * sin(pos.y * P.freqy),
    ).mul(varInfo.weight)
  },
  'general',
)
