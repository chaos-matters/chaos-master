import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type OvoidVarParams = Infer<typeof OvoidVarParams>
const OvoidVarParams = struct({
  x: f32,
  y: f32,
})

const OvoidVarParamsDefaults: OvoidVarParams = {
  x: 0.94,
  y: 0.94,
}

const OvoidVarParamsEditor: EditorFor<OvoidVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'X')}
      min={0.0}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y')}
      min={0.0}
      max={2.0}
      step={0.01}
    />
  </>
)

export const ovoidVar = parametricVariation(
  'ovoidVar',
  OvoidVarParams,
  OvoidVarParamsDefaults,
  OvoidVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const T = pos.x * pos.x + pos.y * pos.y + EPS.$
    const r = varInfo.weight / T
    return vec2f(pos.x + pos.x * r * P.x, pos.y + pos.y * r * P.y)
  },
  'general',
)
