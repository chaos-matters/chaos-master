import { f32, struct, vec2f } from 'typegpu/data'
import { cos, exp, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Exp2BSVarParams = struct({
  x1: f32,
  y1: f32,
  y2: f32,
})

type Exp2BSVarParams = Infer<typeof Exp2BSVarParams>

const Exp2BSVarParamsDefaults: Exp2BSVarParams = {
  x1: 1.0,
  y1: 1.0,
  y2: 1.0,
}

const Exp2BSVarParamsEditor: EditorFor<Exp2BSVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'x1', 'X1', props.dataParameterPath)}
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

export const exp2_bsVar = parametricVariation(
  'exp2_bsVar',
  Exp2BSVarParams,
  Exp2BSVarParamsDefaults,
  Exp2BSVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const expe = exp(pos.x * P.x1)
    const expsin = sin(pos.y * P.y1)
    const expcos = cos(pos.y * P.y2)
    return vec2f(expe * expcos, expe * expsin).mul(varInfo.weight)
  },
  'general',
)
