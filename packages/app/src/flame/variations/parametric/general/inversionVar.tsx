import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type InversionVarParams = Infer<typeof InversionVarParams>
const InversionVarParams = struct({
  radius: f32,
  centerX: f32,
  centerY: f32,
})

const InversionVarParamsDefaults: InversionVarParams = {
  radius: 1.0,
  centerX: 0.0,
  centerY: 0.0,
}

const InversionVarParamsEditor: EditorFor<InversionVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'radius', 'Radius')}
      min={0.1}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'centerX', 'Center X')}
      min={-2}
      max={2}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'centerY', 'Center Y')}
      min={-2}
      max={2}
      step={0.01}
    />
  </>
)

export const inversionVar = parametricVariation(
  'inversionVar',
  InversionVarParams,
  InversionVarParamsDefaults,
  InversionVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const dx = pos.x - P.centerX
    const dy = pos.y - P.centerY
    const r2 = dx * dx + dy * dy + 0.000001
    const scale = (P.radius * P.radius) / r2
    return vec2f(P.centerX + dx * scale, P.centerY + dy * scale).mul(
      varInfo.weight,
    )
  },
  'general',
)
