import { f32, struct, vec2f } from 'typegpu/data'
import { abs, atan2, cos, select, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Disc2VarParams = struct({
  rot: f32,
  twist: f32,
})

type Disc2VarParams = Infer<typeof Disc2VarParams>

const Disc2VarParamsDefaults: Disc2VarParams = {
  rot: 2.0,
  twist: 0.5,
}

const Disc2VarParamsEditor: EditorFor<Disc2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'rot', 'Rot', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'twist', 'Twist', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
  </>
)

export const disc2Var = parametricVariation(
  'disc2Var',
  Disc2VarParams,
  Disc2VarParamsDefaults,
  Disc2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let sinadd = sin(P.twist)
    let cosadd = cos(P.twist) - 1.0
    const twistAbs = abs(P.twist)
    if (twistAbs > 2.0 * PI.$) {
      const sign = select(f32(-1.0), f32(1.0), P.twist >= 0.0)
      const k = 1.0 + P.twist - sign * 2.0 * PI.$
      sinadd *= k
      cosadd *= k
    }
    const t = P.rot * PI.$ * (pos.x + pos.y)
    const theta = atan2(pos.y, pos.x)
    const factor = theta / PI.$
    return vec2f((sin(t) + cosadd) * factor, (cos(t) + sinadd) * factor).mul(
      varInfo.weight,
    )
  },
  'general',
)
