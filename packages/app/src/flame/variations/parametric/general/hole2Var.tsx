import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, pow, select, sin, sqrt, tan } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Hole2VarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
  inside: f32,
  shape: f32,
})

type Hole2VarParams = Infer<typeof Hole2VarParams>

const Hole2VarParamsDefaults: Hole2VarParams = {
  a: 1.0,
  b: 2.0,
  c: 1.0,
  d: 1.0,
  inside: 0,
  shape: 0,
}

const Hole2VarParamsEditor: EditorFor<Hole2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={0.1}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B', props.dataParameterPath)}
      min={0.1}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C', props.dataParameterPath)}
      min={0.1}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D', props.dataParameterPath)}
      min={0.1}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'inside', 'Inside', props.dataParameterPath)}
      min={0}
      max={1}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'shape', 'Shape', props.dataParameterPath)}
      min={0}
      max={9}
      step={1}
    />
  </>
)

export const hole2Var = parametricVariation(
  'hole2Var',
  Hole2VarParams,
  Hole2VarParamsDefaults,
  Hole2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const rhosq = pos.x * pos.x + pos.y * pos.y
    const theta = atan2(pos.y, pos.x) * P.d
    const delta = pow(theta / PI.$ + 1.0, P.a) * P.c

    let r1 = pos.x
    if (P.shape < 1.0) {
      r1 = sqrt(rhosq) + delta
    } else if (P.shape < 2.0) {
      r1 = sqrt(rhosq + delta)
    } else if (P.shape < 3.0) {
      r1 = sqrt(rhosq + sin(P.b * theta) + delta)
    } else if (P.shape < 4.0) {
      r1 = sqrt(rhosq + sin(theta) + delta)
    } else if (P.shape < 5.0) {
      r1 = sqrt(rhosq + theta * theta - delta + 1.0)
    } else if (P.shape < 6.0) {
      r1 = sqrt(rhosq + abs(tan(theta)) + delta)
    } else if (P.shape < 7.0) {
      r1 = sqrt(rhosq * (1.0 + sin(P.b * theta)) + delta)
    } else if (P.shape < 8.0) {
      r1 = sqrt(rhosq + abs(sin(0.5 * P.b * theta)) + delta)
    } else if (P.shape < 9.0) {
      r1 = sqrt(rhosq + sin(PI.$ * sin(P.b * theta)) + delta)
    } else {
      r1 = sqrt(
        rhosq +
          (sin(P.b * theta) + sin(2.0 * P.b * theta + PI.$ / 2.0)) / 2.0 +
          delta,
      )
    }

    const factor = select(r1, 1.0 / r1, P.inside > 0.5)
    return vec2f(factor * cos(theta), factor * sin(theta)).mul(varInfo.weight)
  },
  'general',
)
