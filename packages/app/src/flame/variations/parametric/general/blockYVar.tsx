import { f32, struct, vec2f } from 'typegpu/data'
import { cos, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const BlockYVarParams = struct({
  x: f32,
  y: f32,
  mp: f32,
})
type BlockYVarParams = Infer<typeof BlockYVarParams>
const BlockYVarParamsDefaults: BlockYVarParams = {
  x: 1.0,
  y: 1.0,
  mp: 0.5,
}
const BlockYVarParamsEditor: EditorFor<BlockYVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x', 'X')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y', 'Y')}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'mp', 'MP')}
      min={0.01}
      max={5}
      step={0.01}
    />
  </>
)
export const blockYVar = parametricVariation(
  'blockYVar',
  BlockYVarParams,
  BlockYVarParamsDefaults,
  BlockYVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const v = varInfo.weight / (PI.$ * 0.5)
    const T = (cos(pos.x) + cos(pos.y)) / P.mp + 1.0
    const r = v / select(T, 1.0e-10, T === 0.0)
    const tmp = pos.y * pos.y + pos.x * pos.x + 1.0
    const x2 = 2.0 * pos.x
    const y2 = 2.0 * pos.y
    const xmax = 0.5 * (sqrt(tmp + x2) + sqrt(tmp - x2))
    const ymax = 0.5 * (sqrt(tmp + y2) + sqrt(tmp - y2))
    const newX = r * xmax * P.x
    const newY = r * ymax * P.y
    return vec2f(newX, newY)
  },
  'general',
)
