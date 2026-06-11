import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, floor, max, pow, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SphericalNVarParams = struct({
  power: f32,
  dist: f32,
})

type SphericalNVarParams = Infer<typeof SphericalNVarParams>

const SphericalNVarParamsDefaults: SphericalNVarParams = {
  power: 3.0,
  dist: 1.0,
}

const SphericalNVarParamsEditor: EditorFor<SphericalNVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'power', 'Power', props.dataParameterPath)}
      min={2}
      max={20}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'dist', 'Dist', props.dataParameterPath)}
      min={0.1}
      max={5}
      step={0.01}
    />
  </>
)

export const sphericalNVar = parametricVariation(
  'sphericalNVar',
  SphericalNVarParams,
  SphericalNVarParamsDefaults,
  SphericalNVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r = pow(sqrt(pos.x * pos.x + pos.y * pos.y), P.dist)
    const n = floor(P.power * random())
    const pwrSafe = max(floor(P.power), 1.0)
    const alpha = atan2(pos.y, pos.x) + (n * 2.0 * PI.$) / pwrSafe
    const rSafe = select(r, 1.0, r <= EPS.$)
    return vec2f(cos(alpha) / rSafe, sin(alpha) / rSafe).mul(varInfo.weight)
  },
  'general',
)
