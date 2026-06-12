import { f32, i32, struct, u32, vec2f } from 'typegpu/data'
import { floor, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const AM = 1.0 / 2147483647.0

const CircleLinearVarParams = struct({
  sc: f32,
  k: f32,
  dens1: f32,
  dens2: f32,
  reverse: f32,
  seed: f32,
})

type CircleLinearVarParams = Infer<typeof CircleLinearVarParams>

const CircleLinearVarParamsDefaults: CircleLinearVarParams = {
  sc: 1.0,
  k: 0.5,
  dens1: 0.5,
  dens2: 0.5,
  reverse: 1.0,
  seed: 0.0,
}

const CircleLinearVarParamsEditor: EditorFor<CircleLinearVarParams> = (
  props,
) => (
  <>
    <RangeEditor
      {...editorProps(props, 'sc', 'Sc', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'k', 'K', props.dataParameterPath)}
      min={0.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'dens1', 'Dens1', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'dens2', 'Dens2', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'reverse', 'Reverse', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={1.0}
    />
    <RangeEditor
      {...editorProps(props, 'seed', 'Seed', props.dataParameterPath)}
      min={0.0}
      max={100.0}
      step={1.0}
    />
  </>
)

export const circleLinearVar = parametricVariation(
  'circleLinearVar',
  CircleLinearVarParams,
  CircleLinearVarParamsDefaults,
  CircleLinearVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const M = f32(floor((0.5 * pos.x) / P.sc))
    const N = f32(floor((0.5 * pos.y) / P.sc))
    let X = pos.x - (M * 2.0 + 1.0) * P.sc
    let Y = pos.y - (N * 2.0 + 1.0) * P.sc
    const U = sqrt(X * X + Y * Y)

    // Inline discretNoise2
    const n1 = i32(M + 10.0) + i32(N + 3.0) * 57
    const n1x = i32(u32(n1) << u32(13)) ^ n1
    const V =
      (0.3 +
        0.7 *
          f32((n1x * (n1x * n1x * 15731 + 789221) + 1376312589) & 0x7fffffff) *
          AM) *
      P.sc

    const n2 = i32(M + P.seed) + i32(N) * 57
    const n2x = i32(u32(n2) << u32(13)) ^ n2
    const Z1 =
      f32((n2x * (n2x * n2x * 15731 + 789221) + 1376312589) & 0x7fffffff) * AM

    const hit = Z1 < P.dens1 && U < V
    if (!hit) {
      return vec2f(X + (M * 2.0 + 1.0) * P.sc, Y + (N * 2.0 + 1.0) * P.sc).mul(
        varInfo.weight,
      )
    }

    const reverseCond = P.reverse > 0.0
    const z1Cond = select(
      Z1 > P.dens1 * P.dens2,
      Z1 < P.dens1 * P.dens2,
      reverseCond,
    )
    const Z = (V / U) * (1.0 - P.k) + P.k
    X = select(Z * X, P.k * X, z1Cond)
    Y = select(Z * Y, P.k * Y, z1Cond)

    return vec2f(X + (M * 2.0 + 1.0) * P.sc, Y + (N * 2.0 + 1.0) * P.sc).mul(
      varInfo.weight,
    )
  },
  'general',
)
