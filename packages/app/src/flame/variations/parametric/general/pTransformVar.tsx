import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, exp, log, max, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PTransformVarParams = struct({
  rotate: f32,
  power: f32,
  shift: f32,
  split: f32,
  useLog: f32,
})

type PTransformVarParams = Infer<typeof PTransformVarParams>

const PTransformVarParamsDefaults: PTransformVarParams = {
  rotate: 0.3,
  power: 2.0,
  shift: 0.4,
  split: 0.0,
  useLog: 1.0,
}

const PTransformVarParamsEditor: EditorFor<PTransformVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'rotate', 'Rotate', props.dataParameterPath)}
      min={-3.14}
      max={3.14}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'power', 'Power', props.dataParameterPath)}
      min={1.0}
      max={20.0}
      step={1.0}
    />
    <RangeEditor
      {...editorProps(props, 'shift', 'Shift', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'split', 'Split', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'useLog', 'Use Log', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={1.0}
    />
  </>
)

export const pTransformVar = parametricVariation(
  'pTransformVar',
  PTransformVarParams,
  PTransformVarParamsDefaults,
  PTransformVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const theta = atan2(pos.y, pos.x)

    const useLog = abs(P.useLog) > 0.5
    const rho = select(
      r / max(P.power, EPS.$) + P.shift,
      log(max(r, EPS.$)) / max(P.power, EPS.$) + P.shift,
      useLog,
    )

    const rhoAdj = select(rho - P.split, rho + P.split, pos.x >= 0.0)
    const rhoFinal = select(rhoAdj, exp(rhoAdj), useLog)

    return vec2f(
      rhoFinal * cos(theta + P.rotate),
      rhoFinal * sin(theta + P.rotate),
    ).mul(varInfo.weight)
  },
  'general',
)
