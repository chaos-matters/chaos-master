import { f32, i32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, floor, pow, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const JuliaQVarParams = struct({
  power: f32,
  divisor: f32,
})
type JuliaQVarParams = Infer<typeof JuliaQVarParams>
const JuliaQVarParamsDefaults: JuliaQVarParams = {
  power: 2.0,
  divisor: 1.0,
}
const JuliaQVarParamsEditor: EditorFor<JuliaQVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={-10}
      max={10}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'divisor', 'Divisor')}
      min={1}
      max={10}
      step={1}
    />
  </>
)
export const juliaQVar = parametricVariation(
  'juliaQVar',
  JuliaQVarParams,
  JuliaQVarParamsDefaults,
  JuliaQVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const power = i32(floor(P.power))
    const divisor = i32(floor(P.divisor))
    const f_power = f32(power)
    const f_divisor = f32(divisor)
    const safe_power = select(f_power, 1.0, f_power === 0.0)
    const half_inv_power = (0.5 * f_divisor) / safe_power
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const a = atan2(pos.y, pos.x)
    const r_new = pow(r, half_inv_power)
    const k = f32(floor(random() * f_power))
    const a_new = (a + 2.0 * PI.$ * k) * (f_divisor / safe_power)
    const newX = varInfo.weight * r_new * cos(a_new)
    const newY = varInfo.weight * r_new * sin(a_new)
    return vec2f(newX, newY)
  },
  'general',
)
