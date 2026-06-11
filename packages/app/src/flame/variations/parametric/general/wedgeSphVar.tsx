import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, floor, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS, PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const WedgeSphVarParams = struct({
  angle: f32,
  hole: f32,
  count: f32,
  swirl: f32,
})

type WedgeSphVarParams = Infer<typeof WedgeSphVarParams>

const WedgeSphVarParamsDefaults: WedgeSphVarParams = {
  angle: 0.2,
  hole: 0.2,
  count: 2.0,
  swirl: 0.3,
}

const WedgeSphVarParamsEditor: EditorFor<WedgeSphVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle', props.dataParameterPath)}
      min={0.0}
      max={6.283}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'hole', 'Hole', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'count', 'Count', props.dataParameterPath)}
      min={1.0}
      max={20.0}
      step={1.0}
    />
    <RangeEditor
      {...editorProps(props, 'swirl', 'Swirl', props.dataParameterPath)}
      min={-2.0}
      max={2.0}
      step={0.01}
    />
  </>
)

export const wedgeSphVar = parametricVariation(
  'wedgeSphVar',
  WedgeSphVarParams,
  WedgeSphVarParamsDefaults,
  WedgeSphVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const r = 1.0 / (sqrt(pos.x * pos.x + pos.y * pos.y) + EPS.$)
    const a = atan2(pos.y, pos.x) + P.swirl * r
    const c = floor((P.count * a + PI.$) / (2.0 * PI.$))
    const compFac = 1.0 - (P.angle * P.count) / (2.0 * PI.$)
    const a2 = a * compFac + c * P.angle
    const rf = r + P.hole

    return vec2f(rf * cos(a2), rf * sin(a2)).mul(varInfo.weight)
  },
  'general',
)
