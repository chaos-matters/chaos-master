import { f32, i32, struct, u32, vec2f } from 'typegpu/data'
import { floor, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const AM = 1.0 / 2147483647.0

const CircleRandVarParams = struct({
  sc: f32,
  dens: f32,
  x: f32,
  y: f32,
  seed: f32,
})

type CircleRandVarParams = Infer<typeof CircleRandVarParams>

const CircleRandVarParamsDefaults: CircleRandVarParams = {
  sc: 1.0,
  dens: 0.5,
  x: 10.0,
  y: 10.0,
  seed: 0.0,
}

const CircleRandVarParamsEditor: EditorFor<CircleRandVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'sc', 'Sc', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'dens', 'Dens', props.dataParameterPath)}
      min={0.0}
      max={1.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x', 'X', props.dataParameterPath)}
      min={0.1}
      max={50.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y', props.dataParameterPath)}
      min={0.1}
      max={50.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'seed', 'Seed', props.dataParameterPath)}
      min={0.0}
      max={1000000.0}
      step={1.0}
    />
  </>
)

export const circleRandVar = parametricVariation(
  'circleRandVar',
  CircleRandVarParams,
  CircleRandVarParamsDefaults,
  CircleRandVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let outX = f32(0.0)
    let outY = f32(0.0)
    let hit = false
    for (let iter = 0; iter < 100 && !hit; iter++) {
      let X = P.x * (1.0 - 2.0 * random())
      let Y = P.y * (1.0 - 2.0 * random())
      const M = i32(floor((0.5 * X) / P.sc))
      const N = i32(floor((0.5 * Y) / P.sc))
      X = X - f32(M * 2 + 1) * P.sc
      Y = Y - f32(N * 2 + 1) * P.sc
      const U = sqrt(X * X + Y * Y)

      const n1 = M + i32(P.seed) + N * 57
      const n1x = i32(u32(n1) << u32(13)) ^ n1
      const z1 =
        f32((n1x * (n1x * n1x * 15731 + 789221) + 1376312589) & 0x7fffffff) * AM

      const n2 = M + 10 + (N + 3) * 57
      const n2x = i32(u32(n2) << u32(13)) ^ n2
      const V =
        (0.3 +
          0.7 *
            f32(
              (n2x * (n2x * n2x * 15731 + 789221) + 1376312589) & 0x7fffffff,
            ) *
            AM) *
        P.sc

      hit = z1 <= P.dens && U <= V
      outX = X + f32(M * 2 + 1) * P.sc
      outY = Y + f32(N * 2 + 1) * P.sc
    }

    return vec2f(pos.x + outX, pos.y + outY).mul(varInfo.weight)
  },
  'general',
)
