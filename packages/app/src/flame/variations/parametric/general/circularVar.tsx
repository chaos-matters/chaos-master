import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, floor, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CircularVarParams = struct({
  angle: f32,
  seed: f32,
})

type CircularVarParams = Infer<typeof CircularVarParams>

const CircularVarParamsDefaults: CircularVarParams = {
  angle: 90.0,
  seed: 0.0,
}

const CircularVarParamsEditor: EditorFor<CircularVarParams> = (props) => (
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
  </>
)

export const circularVar = parametricVariation(
  'circularVar',
  CircularVarParams,
  CircularVarParamsDefaults,
  CircularVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const c_a = (P.angle * PI.$) / 180.0
    let aux = sin(pos.x * 12.9898 + pos.y * 78.233 + P.seed) * 43758.5453
    aux = aux - floor(aux)
    const rnd = (2.0 * (random() + aux) - 2.0) * c_a
    const rad = sqrt(pos.x * pos.x + pos.y * pos.y)
    const ang = atan2(pos.y, pos.x)
    return vec2f(cos(ang + rnd) * rad, sin(ang + rnd) * rad).mul(varInfo.weight)
  },
  'general',
)
