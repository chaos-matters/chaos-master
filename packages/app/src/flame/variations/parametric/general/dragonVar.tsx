import { f32, struct, vec2f } from 'typegpu/data'
import { select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type DragonVarParams = Infer<typeof DragonVarParams>
const DragonVarParams = struct({
  iterations: f32,
})

const DragonVarParamsDefaults: DragonVarParams = {
  iterations: 12,
}

const DragonVarParamsEditor: EditorFor<DragonVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'iterations', 'Iterations')}
      min={2}
      max={20}
      step={1}
    />
  </>
)

export const dragonVar = parametricVariation(
  'dragonVar',
  DragonVarParams,
  DragonVarParamsDefaults,
  DragonVarParamsEditor,
  (pos, varInfo, _P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const choice = x > 0.0
    const nx = select((x + y) * 0.5 + 1.0, (x - y) * 0.5, choice)
    const ny = select((y - x) * 0.5, (x + y) * 0.5, choice)
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
