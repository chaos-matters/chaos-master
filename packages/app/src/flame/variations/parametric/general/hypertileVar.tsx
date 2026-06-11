import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type HypertileVarParams = Infer<typeof HypertileVarParams>
const HypertileVarParams = struct({
  p: f32,
  q: f32,
})

const HypertileVarParamsDefaults: HypertileVarParams = {
  p: 3,
  q: 7,
}

const HypertileVarParamsEditor: EditorFor<HypertileVarParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'p', 'P')} min={3} max={10} step={1} />
    <RangeEditor {...editorProps(props, 'q', 'Q')} min={3} max={10} step={1} />
  </>
)

export const hypertileVar = parametricVariation(
  'hypertileVar',
  HypertileVarParams,
  HypertileVarParamsDefaults,
  HypertileVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const r = sqrt(x * x + y * y)
    const theta = atan2(y, x)
    const pa = PI.$ / P.p
    const a = theta + pa
    const sector = (2.0 * PI.$) / P.q
    const nx = r * cos(a * sector)
    const ny = r * sin(a * sector)
    return vec2f(nx / (1.0 + r), ny / (1.0 + r)).mul(varInfo.weight)
  },
  'general',
)
