import { f32, struct, vec2f } from 'typegpu/data'
import { abs, cos, floor, fract, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type TreeVarParams = Infer<typeof TreeVarParams>
const TreeVarParams = struct({
  branches: f32,
  angle: f32,
  scale: f32,
})

const TreeVarParamsDefaults: TreeVarParams = {
  branches: 2,
  angle: 0.6,
  scale: 0.7,
}

const TreeVarParamsEditor: EditorFor<TreeVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'branches', 'Branches')}
      min={2}
      max={5}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'angle', 'Angle')}
      min={0.1}
      max={1.5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0.3}
      max={0.95}
      step={0.01}
    />
  </>
)

export const treeVar = parametricVariation(
  'treeVar',
  TreeVarParams,
  TreeVarParamsDefaults,
  TreeVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = abs(pos.x)
    const y = pos.y
    const br = floor(x * P.branches)
    const angleOffset = (br / (P.branches - 1.0)) * 2.0 - 1.0
    const rotate = angleOffset * P.angle
    const s = sin(rotate)
    const c = cos(rotate)
    const nx = P.scale * (c * x + s * y)
    const ny = P.scale * (-s * x + c * y) + 0.3
    return vec2f(nx + fract(x * 37.0) * 0.02, ny).mul(varInfo.weight)
  },
  'general',
)
