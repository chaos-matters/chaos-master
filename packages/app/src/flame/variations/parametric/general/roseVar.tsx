import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type RoseVarParams = Infer<typeof RoseVarParams>
const RoseVarParams = struct({
  n: f32,
  d: f32,
})

const RoseVarParamsDefaults: RoseVarParams = {
  n: 3,
  d: 2,
}

const RoseVarParamsEditor: EditorFor<RoseVarParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'n', 'N')} min={1} max={20} step={1} />
    <RangeEditor {...editorProps(props, 'd', 'D')} min={1} max={20} step={1} />
  </>
)

export const roseVar = parametricVariation(
  'roseVar',
  RoseVarParams,
  RoseVarParamsDefaults,
  RoseVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const k = P.n / P.d
    const theta = pos.x * PI.$
    const r = cos(k * theta)
    const nx = r * cos(theta)
    const ny = r * sin(theta)
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
