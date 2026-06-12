import { f32, struct, vec2f } from 'typegpu/data'
import { sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ConicVarParams = struct({
  eccentricity: f32,
  holes: f32,
})
type ConicVarParams = Infer<typeof ConicVarParams>
const ConicVarDefaults: ConicVarParams = {
  eccentricity: 1.0,
  holes: 0.0,
}
const ConicVarEditor: EditorFor<ConicVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'eccentricity', 'Eccentricity')}
      min={0}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'holes', 'Holes')}
      min={-1}
      max={1}
      step={0.01}
    />
  </>
)
export const conicVar = parametricVariation(
  'conicVar',
  ConicVarParams,
  ConicVarDefaults,
  ConicVarEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const ct = pos.x / r
    const rn =
      (varInfo.weight * (random() - P.holes) * P.eccentricity) /
      (1.0 + P.eccentricity * ct) /
      r
    return vec2f(rn * pos.x, rn * pos.y)
  },
  'general',
)
