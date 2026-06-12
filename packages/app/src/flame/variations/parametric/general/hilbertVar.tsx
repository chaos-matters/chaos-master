import { f32, struct, vec2f } from 'typegpu/data'
import { abs, floor, fract, select } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type HilbertVarParams = Infer<typeof HilbertVarParams>
const HilbertVarParams = struct({
  iterations: f32,
})

const HilbertVarParamsDefaults: HilbertVarParams = {
  iterations: 5,
}

const HilbertVarParamsEditor: EditorFor<HilbertVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'iterations', 'Iterations')}
      min={1}
      max={10}
      step={1}
    />
  </>
)

export const hilbertVar = parametricVariation(
  'hilbertVar',
  HilbertVarParams,
  HilbertVarParamsDefaults,
  HilbertVarParamsEditor,
  (pos, varInfo, _P) => {
    'use gpu'
    const x = abs(pos.x) * 0.5 + 0.25
    const y = abs(pos.y) * 0.5 + 0.25
    const qx = f32(floor(x * 2.0))
    const qy = f32(floor(y * 2.0))
    const fx = fract(x * 2.0)
    const fy = fract(y * 2.0)
    const flipx = 1.0 - fx
    const flipy = 1.0 - fy
    const nx = select(
      select(flipx, fy, qy > 0.0),
      select(flipy, fx, qy > 0.0),
      qx > 0.0,
    )
    const ny = select(
      select(flipy, flipx, qy > 0.0),
      select(fx, fy, qy > 0.0),
      qx > 0.0,
    )
    return vec2f(nx * 2.0 - 1.0, ny * 2.0 - 1.0).mul(varInfo.weight)
  },
  'general',
)
