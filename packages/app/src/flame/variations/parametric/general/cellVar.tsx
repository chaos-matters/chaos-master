import { f32, struct, vec2f } from 'typegpu/data'
import { floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CellVarParams = struct({
  size: f32,
})

type CellVarParams = Infer<typeof CellVarParams>

const CellVarParamsDefaults: CellVarParams = {
  size: 0.6,
}

const CellVarParamsEditor: EditorFor<CellVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'size', 'Size', props.dataParameterPath)}
      min={0.01}
      max={5.0}
      step={0.01}
    />
  </>
)

export const cellVar = parametricVariation(
  'cellVar',
  CellVarParams,
  CellVarParamsDefaults,
  CellVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const inv = 1.0 / P.size
    const cx = f32(floor(pos.x * inv))
    const cy = f32(floor(pos.y * inv))
    const dx = pos.x - cx * P.size
    const dy = pos.y - cy * P.size

    let nx = pos.x
    let ny = pos.y

    if (cy >= 0.0) {
      if (cx >= 0.0) {
        ny = cy * 2.0
        nx = cx * 2.0
      } else {
        ny = cy * 2.0
        nx = -(2.0 * cx + 1.0)
      }
    } else {
      if (cx >= 0.0) {
        ny = -(2.0 * cy + 1.0)
        nx = cx * 2.0
      } else {
        ny = -(2.0 * cy + 1.0)
        nx = -(2.0 * cx + 1.0)
      }
    }

    return vec2f(dx + nx * P.size, -(dy + ny * P.size)).mul(varInfo.weight)
  },
  'general',
)
