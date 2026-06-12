import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, log, select, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const TargetVarParams = struct({
  even: f32,
  odd: f32,
  size: f32,
})

type TargetVarParams = Infer<typeof TargetVarParams>

const TargetVarParamsDefaults: TargetVarParams = {
  even: -PI.$,
  odd: -PI.$,
  size: 0.5,
}

const TargetVarParamsEditor: EditorFor<TargetVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'even', 'Even', props.dataParameterPath)}
      min={-6.2831853}
      max={6.2831853}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'odd', 'Odd', props.dataParameterPath)}
      min={-6.2831853}
      max={6.2831853}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'size', 'Size', props.dataParameterPath)}
      min={0.01}
      max={2}
      step={0.01}
    />
  </>
)

export const targetVar = parametricVariation(
  'targetVar',
  TargetVarParams,
  TargetVarParamsDefaults,
  TargetVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const a = atan2(pos.y, pos.x)
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const halfSize = 0.5 * P.size
    let t = log(r)
    if (t < 0.0) {
      t = t - halfSize
    }
    t = abs(t % P.size)
    const addAngle = select(P.odd, P.even, t < halfSize)
    const angle = a + addAngle
    return vec2f(r * cos(angle), r * sin(angle)).mul(varInfo.weight)
  },
  'general',
)
