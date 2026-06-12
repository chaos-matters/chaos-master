import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, floor, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Circular2VarParams = struct({
  angle: f32,
  seed: f32,
  xx: f32,
  yy: f32,
})

type Circular2VarParams = Infer<typeof Circular2VarParams>

const Circular2VarParamsDefaults: Circular2VarParams = {
  angle: 90.0,
  seed: 0.0,
  xx: 12.9898,
  yy: 78.233,
}

const Circular2VarParamsEditor: EditorFor<Circular2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle', props.dataParameterPath)}
      min={-360.0}
      max={360.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'seed', 'Seed', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xx', 'XX', props.dataParameterPath)}
      min={-50.0}
      max={50.0}
      step={0.0001}
    />
    <RangeEditor
      {...editorProps(props, 'yy', 'YY', props.dataParameterPath)}
      min={-50.0}
      max={50.0}
      step={0.001}
    />
  </>
)

export const circular2Var = parametricVariation(
  'circular2Var',
  Circular2VarParams,
  Circular2VarParamsDefaults,
  Circular2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const c_a = (P.angle * PI.$) / 180.0
    let aux = sin(pos.x * P.xx + pos.y * P.yy + P.seed) * 43758.5453
    aux = aux - floor(aux)
    const rnd = (2.0 * (random() + aux) - 2.0) * c_a
    const rad = sqrt(pos.x * pos.x + pos.y * pos.y)
    const ang = atan2(pos.y, pos.x)
    return vec2f(cos(ang + rnd) * rad, sin(ang + rnd) * rad).mul(varInfo.weight)
  },
  'general',
)
