import { f32, struct, vec2f } from 'typegpu/data'
import { abs } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type GingerBreadVarParams = Infer<typeof GingerBreadVarParams>
const GingerBreadVarParams = struct({
  scale: f32,
})

const GingerBreadVarParamsDefaults: GingerBreadVarParams = {
  scale: 1.0,
}

const GingerBreadVarParamsEditor: EditorFor<GingerBreadVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0.1}
      max={3.0}
      step={0.01}
    />
  </>
)

export const gingerBreadVar = parametricVariation(
  'gingerBreadVar',
  GingerBreadVarParams,
  GingerBreadVarParamsDefaults,
  GingerBreadVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const nx = 1.0 - pos.y + abs(pos.x)
    const ny = pos.x
    return vec2f(P.scale * nx, P.scale * ny).mul(varInfo.weight)
  },
  'general',
)
