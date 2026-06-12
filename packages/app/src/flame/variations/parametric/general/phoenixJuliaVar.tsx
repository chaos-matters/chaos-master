import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, pow, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type PhoenixJuliaParams = Infer<typeof PhoenixJuliaParams>
const PhoenixJuliaParams = struct({
  power: f32,
  dist: f32,
  x_distort: f32,
  y_distort: f32,
})

const PhoenixJuliaDefaults: PhoenixJuliaParams = {
  power: 2.5,
  dist: 1.0,
  x_distort: -0.5,
  y_distort: 0.0,
}

const PhoenixJuliaEditor: EditorFor<PhoenixJuliaParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power')}
      min={-10}
      max={10}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'dist', 'Dist')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x_distort', 'X Distort')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y_distort', 'Y Distort')}
      min={-2}
      max={2}
      step={0.01}
    />
  </>
)

export const phoenixJuliaVar = parametricVariation(
  'phoenixJuliaVar',
  PhoenixJuliaParams,
  PhoenixJuliaDefaults,
  PhoenixJuliaEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const preX = pos.x * (P.x_distort + 1.0)
    const preY = pos.y * (P.y_distort + 1.0)
    const invN = P.dist / P.power
    const inv2PI_N = (PI.$ * 2.0) / P.power
    const cN = P.dist / P.power / 2.0
    const a = atan2(preY, preX) * invN + random() * inv2PI_N
    const r = pow(pos.x * pos.x + pos.y * pos.y, cN)
    return vec2f(r * cos(a), r * sin(a)).mul(varInfo.weight)
  },
  'general',
)
