import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { EPS } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const FlowerVarParams = struct({
  holes: f32,
  petals: f32,
})
type FlowerVarParams = Infer<typeof FlowerVarParams>
const FlowerVarDefaults: FlowerVarParams = {
  holes: 0.4,
  petals: 7.0,
}
const FlowerVarEditor: EditorFor<FlowerVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'holes', 'Holes')}
      min={0}
      max={1}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'petals', 'Petals')}
      min={0}
      max={20}
      step={0.01}
    />
  </>
)
export const flowerVar = parametricVariation(
  'flowerVar',
  FlowerVarParams,
  FlowerVarDefaults,
  FlowerVarEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const d = sqrt(pos.x * pos.x + pos.y * pos.y)
    const safeD = d + EPS.$
    const theta = atan2(pos.y, pos.x)
    const r =
      (varInfo.weight * (random() - P.holes) * cos(P.petals * theta)) / safeD
    return vec2f(r * pos.x, r * pos.y)
  },
  'general',
)
