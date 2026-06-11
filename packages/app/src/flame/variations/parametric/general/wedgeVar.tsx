import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, floor, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const WedgeVarParams = struct({
  angle: f32,
  hole: f32,
  count: f32,
  swirl: f32,
})

type WedgeVarParams = Infer<typeof WedgeVarParams>

const WedgeVarParamsDefaults: WedgeVarParams = {
  angle: PI.$ / 2.0,
  hole: 0.0,
  count: 1.0,
  swirl: 0.1,
}

const WedgeVarParamsEditor: EditorFor<WedgeVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle', props.dataParameterPath)}
      min={0}
      max={6.2831853}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'hole', 'Hole', props.dataParameterPath)}
      min={-1}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'count', 'Count', props.dataParameterPath)}
      min={1}
      max={10}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'swirl', 'Swirl', props.dataParameterPath)}
      min={-1}
      max={1}
      step={0.01}
    />
  </>
)

export const wedgeVar = parametricVariation(
  'wedgeVar',
  WedgeVarParams,
  WedgeVarParamsDefaults,
  WedgeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const a = atan2(pos.y, pos.x) + P.swirl * r
    const c = f32(floor(((P.count * a + PI.$) * 0.5) / PI.$))
    const compFac = 1.0 - (P.angle * P.count * 0.5) / PI.$
    const a2 = a * compFac + c * P.angle
    return vec2f((r + P.hole) * cos(a2), (r + P.hole) * sin(a2)).mul(
      varInfo.weight,
    )
  },
  'general',
)
