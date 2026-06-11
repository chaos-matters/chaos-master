import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type MaurerRoseVarParams = Infer<typeof MaurerRoseVarParams>
const MaurerRoseVarParams = struct({
  n: f32,
  d: f32,
})

const MaurerRoseVarParamsDefaults: MaurerRoseVarParams = {
  n: 2,
  d: 29,
}

const MaurerRoseVarParamsEditor: EditorFor<MaurerRoseVarParams> = (props) => (
  <>
    <RangeEditor {...editorProps(props, 'n', 'N')} min={1} max={10} step={1} />
    <RangeEditor {...editorProps(props, 'd', 'D')} min={1} max={120} step={1} />
  </>
)

export const maurerRoseVar = parametricVariation(
  'maurerRoseVar',
  MaurerRoseVarParams,
  MaurerRoseVarParamsDefaults,
  MaurerRoseVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const t = pos.x * P.d * PI.$
    const r = sin(P.n * t)
    const theta = t
    const nx = r * cos(theta)
    const ny = r * sin(theta)
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
