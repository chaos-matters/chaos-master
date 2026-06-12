import { f32, struct, vec2f } from 'typegpu/data'
import { abs, floor } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type RSquaresVarParams = Infer<typeof RSquaresVarParams>
const RSquaresVarParams = struct({
  depth: f32,
  scale: f32,
})

const RSquaresVarParamsDefaults: RSquaresVarParams = {
  depth: 3,
  scale: 0.5,
}

const RSquaresVarParamsEditor: EditorFor<RSquaresVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'depth', 'Depth')}
      min={1}
      max={8}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0.1}
      max={0.9}
      step={0.01}
    />
  </>
)

export const rsquaresVar = parametricVariation(
  'rsquaresVar',
  RSquaresVarParams,
  RSquaresVarParamsDefaults,
  RSquaresVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = abs(pos.x)
    const y = abs(pos.y)
    const quadrant = f32(floor(x * 2.0)) + f32(floor(y * 2.0)) * 2.0
    const fx = x * 2.0 - f32(floor(x * 2.0)) - 0.5
    const fy = y * 2.0 - f32(floor(y * 2.0)) - 0.5
    const nx = fx / P.scale + quadrant * 0.1
    const ny = fy / P.scale
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
