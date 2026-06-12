import { f32, struct, vec2f } from 'typegpu/data'
import { sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Waves3VarParams = struct({
  scalex: f32,
  scaley: f32,
  freqx: f32,
  freqy: f32,
  sxFreq: f32,
  syFreq: f32,
})

type Waves3VarParams = Infer<typeof Waves3VarParams>

const Waves3VarParamsDefaults: Waves3VarParams = {
  scalex: 0.05,
  scaley: 0.05,
  freqx: 7.0,
  freqy: 13.0,
  sxFreq: 0.0,
  syFreq: 2.0,
}

const Waves3VarParamsEditor: EditorFor<Waves3VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scalex', 'Scale X', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scaley', 'Scale Y', props.dataParameterPath)}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'freqx', 'Freq X', props.dataParameterPath)}
      min={0}
      max={20}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'freqy', 'Freq Y', props.dataParameterPath)}
      min={0}
      max={20}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'sxFreq', 'SX Freq', props.dataParameterPath)}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'syFreq', 'SY Freq', props.dataParameterPath)}
      min={0}
      max={10}
      step={0.01}
    />
  </>
)

export const waves3Var = parametricVariation(
  'waves3Var',
  Waves3VarParams,
  Waves3VarParamsDefaults,
  Waves3VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x0 = pos.x
    const y0 = pos.y
    const scalexx = 0.5 * P.scalex * (1.0 + sin(y0 * P.sxFreq))
    const scaleyy = 0.5 * P.scaley * (1.0 + sin(x0 * P.syFreq))
    return vec2f(
      x0 + sin(y0 * P.freqx) * scalexx,
      y0 + sin(x0 * P.freqy) * scaleyy,
    ).mul(varInfo.weight)
  },
  'general',
)
