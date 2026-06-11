import { f32, struct, vec2f } from 'typegpu/data'
import { abs, max, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PressureWaveVarParams = struct({
  xFreq: f32,
  yFreq: f32,
})

type PressureWaveVarParams = Infer<typeof PressureWaveVarParams>

const PressureWaveVarParamsDefaults: PressureWaveVarParams = {
  xFreq: 1.0,
  yFreq: 1.0,
}

const PressureWaveVarParamsEditor: EditorFor<PressureWaveVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'xFreq', 'X Freq', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'yFreq', 'Y Freq', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
  </>
)

export const pressureWaveVar = parametricVariation(
  'pressureWaveVar',
  PressureWaveVarParams,
  PressureWaveVarParamsDefaults,
  PressureWaveVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const pwx = select(P.xFreq * 2.0 * PI.$, 1.0, abs(P.xFreq) < EPS.$)
    const ipwx = 1.0 / max(abs(pwx), EPS.$)

    const pwy = select(P.yFreq * 2.0 * PI.$, 1.0, abs(P.yFreq) < EPS.$)
    const ipwy = 1.0 / max(abs(pwy), EPS.$)

    return vec2f(
      pos.x + ipwx * sin(pwx * pos.x),
      pos.y + ipwy * sin(pwy * pos.y),
    ).mul(varInfo.weight)
  },
  'general',
)
