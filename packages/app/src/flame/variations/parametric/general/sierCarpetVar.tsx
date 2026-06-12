import { f32, struct, vec2f } from 'typegpu/data'
import { floor, fract, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type SierCarpetVarParams = Infer<typeof SierCarpetVarParams>
const SierCarpetVarParams = struct({
  iterations: f32,
})

const SierCarpetVarParamsDefaults: SierCarpetVarParams = {
  iterations: 4,
}

const SierCarpetVarParamsEditor: EditorFor<SierCarpetVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'iterations', 'Iterations')}
      min={1}
      max={8}
      step={1}
    />
  </>
)

export const sierCarpetVar = parametricVariation(
  'sierCarpetVar',
  SierCarpetVarParams,
  SierCarpetVarParamsDefaults,
  SierCarpetVarParamsEditor,
  (pos, varInfo, _P) => {
    'use gpu'
    const x = (pos.x + 1.0) * 0.5
    const y = (pos.y + 1.0) * 0.5
    const cx = f32(floor(x * 3.0))
    const cy = f32(floor(y * 3.0))
    const skip = cx === 1.0 && cy === 1.0
    const fx = fract(x * 3.0)
    const fy = fract(y * 3.0)
    const nx = select(fx, fx * 0.333 + 0.333, skip)
    const ny = select(fy, fy * 0.333 + 0.333, skip)
    return vec2f(nx * 2.0 - 1.0, ny * 2.0 - 1.0).mul(varInfo.weight)
  },
  'general',
)
