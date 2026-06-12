import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type Hypertile2VarParams = Infer<typeof Hypertile2VarParams>
const Hypertile2VarParams = struct({
  p: f32,
  q: f32,
})

const Hypertile2VarParamsDefaults: Hypertile2VarParams = {
  p: 3,
  q: 7,
}

const Hypertile2VarParamsEditor: EditorFor<Hypertile2VarParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'p', 'P')} min={3} max={10} step={1} />
    <RangeEditor {...editorProps(props, 'q', 'Q')} min={3} max={10} step={1} />
  </>
)

export const hypertile2Var = parametricVariation(
  'hypertile2Var',
  Hypertile2VarParams,
  Hypertile2VarParamsDefaults,
  Hypertile2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const r = sqrt(x * x + y * y)
    const theta = atan2(y, x)
    const pa = (2.0 * PI.$) / P.p
    const nr = r / (r + 1.0)
    const nt = theta + pa * sin(P.q * theta)
    return vec2f(nr * cos(nt), nr * sin(nt)).mul(varInfo.weight)
  },
  'general',
)
