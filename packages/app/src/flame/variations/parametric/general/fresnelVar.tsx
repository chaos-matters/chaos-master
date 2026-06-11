import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type FresnelVarParams = Infer<typeof FresnelVarParams>
const FresnelVarParams = struct({
  scale: f32,
})

const FresnelVarParamsDefaults: FresnelVarParams = {
  scale: 1.0,
}

const FresnelVarParamsEditor: EditorFor<FresnelVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0.1}
      max={5.0}
      step={0.01}
    />
  </>
)

export const fresnelVar = parametricVariation(
  'fresnelVar',
  FresnelVarParams,
  FresnelVarParamsDefaults,
  FresnelVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const t = (pos.x + pos.y) * P.scale
    const t2 = t * t * PI.$ * 0.5
    return vec2f(cos(t2), sin(t2)).mul(varInfo.weight)
  },
  'general',
)
