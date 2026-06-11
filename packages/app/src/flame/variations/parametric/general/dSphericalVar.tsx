import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const DSphericalVarParams = struct({
  weight: f32,
})

type DSphericalVarParams = Infer<typeof DSphericalVarParams>

const DSphericalVarParamsDefaults: DSphericalVarParams = {
  weight: 0.5,
}

const DSphericalVarParamsEditor: EditorFor<DSphericalVarParams> = (props) => (
  <RangeEditor
    {...editorProps(props, 'weight', 'Weight', props.dataParameterPath)}
    min={0}
    max={1}
    step={0.01}
  />
)

export const dSphericalVar = parametricVariation(
  'dSphericalVar',
  DSphericalVarParams,
  DSphericalVarParamsDefaults,
  DSphericalVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    if (random() < P.weight) {
      const r2 = pos.x * pos.x + pos.y * pos.y + EPS.$
      return vec2f(pos.x / r2, pos.y / r2).mul(varInfo.weight)
    }
    return vec2f(pos.x, pos.y).mul(varInfo.weight)
  },
  'general',
)
