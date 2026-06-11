import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, floor, log, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const M_2_PI = 2.0 / Math.PI

const Bipolar2VarParams = struct({
  shift: f32,
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  e: f32,
  f1: f32,
  g1: f32,
  h: f32,
})

type Bipolar2VarParams = Infer<typeof Bipolar2VarParams>

const Bipolar2VarParamsDefaults: Bipolar2VarParams = {
  shift: 0.0,
  a: 1.0,
  b: 2.0,
  c: 0.5,
  d: 1.0,
  e: 2.0,
  f1: 0.25,
  g1: 1.0,
  h: 1.0,
}

const Bipolar2VarParamsEditor: EditorFor<Bipolar2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'shift', 'Shift', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'e', 'E', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'f1', 'F1', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'g1', 'G1', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'h', 'H', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const bipolar2Var = parametricVariation(
  'bipolar2Var',
  Bipolar2VarParams,
  Bipolar2VarParamsDefaults,
  Bipolar2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x2y2 = (pos.x * pos.x + pos.y * pos.y) * P.g1
    const t = x2y2 + P.a
    const x2 = P.b * pos.x
    const ps = -PI.$ * 0.5 * P.shift
    let y = P.c * atan2(P.e * pos.y, x2y2 - P.d) + ps

    if (y > PI.$ * 0.5) {
      const tmp = y + PI.$ * 0.5
      y = -PI.$ * 0.5 + tmp - PI.$ * floor(tmp / PI.$)
    } else if (y < -PI.$ * 0.5) {
      const tmp = PI.$ * 0.5 - y
      y = PI.$ * 0.5 - (tmp - PI.$ * floor(tmp / PI.$))
    }

    const f1_var = t + x2
    const g1_var = t - x2

    const valid = !(g1_var === 0.0 || f1_var / g1_var <= 0.0)
    return select(
      vec2f(0.0, 0.0),
      vec2f(P.f1 * M_2_PI * log(f1_var / g1_var), M_2_PI * y * P.h),
      valid,
    ).mul(varInfo.weight)
  },
  'general',
)
