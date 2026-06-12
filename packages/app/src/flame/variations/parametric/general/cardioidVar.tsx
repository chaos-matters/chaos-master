import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CardioidVarParams = struct({
  a: f32,
})

type CardioidVarParams = Infer<typeof CardioidVarParams>

const CardioidVarParamsDefaults: CardioidVarParams = {
  a: 1.0,
}

const CardioidVarParamsEditor: EditorFor<CardioidVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const cardioidVar = parametricVariation(
  'cardioidVar',
  CardioidVarParams,
  CardioidVarParamsDefaults,
  CardioidVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const a = atan2(pos.y, pos.x)
    const r = sqrt(pos.x * pos.x + pos.y * pos.y + sin(a * P.a) + 1.0)
    return vec2f(r * cos(a), r * sin(a)).mul(varInfo.weight)
  },
  'general',
)
