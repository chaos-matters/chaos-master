import { f32, struct, vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Cot2BSVarParams = struct({
  x1: f32,
  x2: f32,
  y1: f32,
  y2: f32,
})

type Cot2BSVarParams = Infer<typeof Cot2BSVarParams>

const Cot2BSVarParamsDefaults: Cot2BSVarParams = {
  x1: 2.0,
  x2: 2.0,
  y1: 2.0,
  y2: 2.0,
}

const Cot2BSVarParamsEditor: EditorFor<Cot2BSVarParams> = (props) => (
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

export const cot2_bsVar = parametricVariation(
  'cot2_bsVar',
  Cot2BSVarParams,
  Cot2BSVarParamsDefaults,
  Cot2BSVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const cotsin = sin(P.x1 * pos.x)
    const cotcos = cos(P.x2 * pos.x)
    const cotsinh = sinh(P.y1 * pos.y)
    const cotcosh = cosh(P.y2 * pos.y)
    const cotden = 1.0 / (cotcosh - cotcos)
    return vec2f(cotden * cotsin, cotden * -cotsinh).mul(varInfo.weight)
  },
  'general',
)
