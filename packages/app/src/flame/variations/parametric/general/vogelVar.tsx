import { f32, struct, vec2f } from 'typegpu/data'
import { cos, floor, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type VogelVarParams = Infer<typeof VogelVarParams>
const VogelVarParams = struct({
  scale: f32,
  n: f32,
})

const VogelVarParamsDefaults: VogelVarParams = {
  scale: 0.3,
  n: 500,
}

const VogelVarParamsEditor: EditorFor<VogelVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0.05}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'n', 'N')}
      min={50}
      max={1000}
      step={1}
    />
  </>
)

const GOLDEN_ANGLE = PI.$ * (3.0 - sqrt(5.0))

export const vogelVar = parametricVariation(
  'vogelVar',
  VogelVarParams,
  VogelVarParamsDefaults,
  VogelVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const dist = sqrt(pos.x * pos.x + pos.y * pos.y)
    const i = f32(floor(P.n * dist * 0.5))
    const theta = i * GOLDEN_ANGLE
    const r = P.scale * sqrt(i)
    return vec2f(r * cos(theta), r * sin(theta)).mul(varInfo.weight)
  },
  'general',
)
