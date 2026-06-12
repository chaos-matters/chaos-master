import { f32, struct, vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Csch2BSVarParams = struct({
  x1: f32,
  x2: f32,
  y1: f32,
  y2: f32,
})

type Csch2BSVarParams = Infer<typeof Csch2BSVarParams>

const Csch2BSVarParamsDefaults: Csch2BSVarParams = {
  x1: 1.0,
  x2: 1.0,
  y1: 1.0,
  y2: 1.0,
}

const Csch2BSVarParamsEditor: EditorFor<Csch2BSVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x1', 'X1', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'x2', 'X2', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y1', 'Y1', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'y2', 'Y2', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const csch2_bsVar = parametricVariation(
  'csch2_bsVar',
  Csch2BSVarParams,
  Csch2BSVarParamsDefaults,
  Csch2BSVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const cschsin = sin(pos.y * P.y1)
    const cschcos = cos(pos.y * P.y2)
    const cschsinh = sinh(pos.x * P.x1)
    const cschcosh = cosh(pos.x * P.x2)
    const d = cosh(2.0 * pos.x) - cos(2.0 * pos.y)
    const cschden = 2.0 / d
    return vec2f(
      cschden * cschsinh * cschcos,
      -cschden * cschcosh * cschsin,
    ).mul(varInfo.weight)
  },
  'general',
)
