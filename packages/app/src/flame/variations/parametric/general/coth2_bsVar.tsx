import { f32, struct, vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Coth2BSVarParams = struct({
  x1: f32,
  x2: f32,
  y1: f32,
  y2: f32,
})

type Coth2BSVarParams = Infer<typeof Coth2BSVarParams>

const Coth2BSVarParamsDefaults: Coth2BSVarParams = {
  x1: 2.0,
  x2: 2.0,
  y1: 2.0,
  y2: 2.0,
}

const Coth2BSVarParamsEditor: EditorFor<Coth2BSVarParams> = (props) => (
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

export const coth2_bsVar = parametricVariation(
  'coth2_bsVar',
  Coth2BSVarParams,
  Coth2BSVarParamsDefaults,
  Coth2BSVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const cothsin = sin(P.y1 * pos.y)
    const cothcos = cos(P.y2 * pos.y)
    const cothsinh = sinh(P.x1 * pos.x)
    const cothcosh = cosh(P.x2 * pos.x)
    const d = cothcosh - cothcos
    const cothden = 1.0 / d
    return vec2f(cothden * cothsinh, cothden * cothsin).mul(varInfo.weight)
  },
  'general',
)
