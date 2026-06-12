import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, floor, pow, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const WedgeJuliaVarParams = struct({
  power: f32,
  dist: f32,
  count: f32,
  angle: f32,
})

type WedgeJuliaVarParams = Infer<typeof WedgeJuliaVarParams>

const WedgeJuliaVarParamsDefaults: WedgeJuliaVarParams = {
  power: 7.0,
  dist: 0.2,
  count: 2.0,
  angle: 0.3,
}

const WedgeJuliaVarParamsEditor: EditorFor<WedgeJuliaVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power', props.dataParameterPath)}
      min={1}
      max={20}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'dist', 'Dist', props.dataParameterPath)}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'count', 'Count', props.dataParameterPath)}
      min={1}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle', props.dataParameterPath)}
      min={0}
      max={PI.$}
      step={0.01}
    />
  </>
)

export const wedgeJuliaVar = parametricVariation(
  'wedgeJuliaVar',
  WedgeJuliaVarParams,
  WedgeJuliaVarParamsDefaults,
  WedgeJuliaVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const invPI = 1.0 / PI.$
    const cf = 1.0 - P.angle * P.count * invPI * 0.5
    const rN = abs(P.power)
    const pwrSafe = select(P.power, EPS.$, abs(P.power) <= EPS.$)
    const cn = (P.dist / pwrSafe) * 0.5
    const r2 = pos.x * pos.x + pos.y * pos.y
    const r = pow(r2, cn)
    const t_rnd = floor(rN * random())
    let a = (atan2(pos.y, pos.x) + 2.0 * PI.$ * t_rnd) / pwrSafe
    const c = f32(floor((P.count * a + PI.$) * invPI * 0.5))
    a = a * cf + c * P.angle
    return vec2f(r * cos(a), r * sin(a)).mul(varInfo.weight)
  },
  'general',
)
