import { f32, i32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, exp, floor, log, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from './types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CPow2VarParams = struct({
  r: f32,
  a: f32,
  divisor: f32,
  range: f32,
})

type CPow2VarParams = Infer<typeof CPow2VarParams>

const CPow2VarParamsDefaults: CPow2VarParams = {
  r: 0.68,
  a: 0.1,
  divisor: 4,
  range: 6,
}

const CPow2VarParamsEditor: EditorFor<CPow2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'r', 'R')}
      min={0}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'a', 'A')}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'divisor', 'Divisor')}
      min={1}
      max={10}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'range', 'Range')}
      min={1}
      max={10}
      step={1}
    />
  </>
)

export const cpow2Var = parametricVariation(
  'cpow2Var',
  CPow2VarParams,
  CPow2VarParamsDefaults,
  CPow2VarParamsEditor,
  (pos, _varInfo, P) => {
    'use gpu'
    const ang = (2.0 * PI.$) / P.divisor
    const c = (P.r * cos((PI.$ / 2.0) * P.a)) / P.divisor
    const d = (P.r * sin((PI.$ / 2.0) * P.a)) / P.divisor
    const half_c = c / 2.0
    const half_d = d / 2.0
    const inv_range = 0.5 / P.range
    const full_range = 2 * PI.$ * P.range
    let a = atan2(pos.y, pos.x)
    let n = i32(floor(P.range * random()))
    if (a < 0) {
      n++
    }
    a += 2 * PI.$ * n
    if (cos(a * inv_range) < random() * 2.0 - 1.0) {
      a -= full_range
    }
    const r2 = pos.x * pos.x + pos.y * pos.y
    const lnr2 = log(r2)
    const r = exp(half_c * lnr2 - d * a)
    const th = c * a + half_d * lnr2 + ang * floor(P.divisor * random())
    return vec2f(r * cos(th), r * sin(th))
  },
)
