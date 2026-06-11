import { f32, struct, vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Cosh2BSVarParams = struct({
  x1: f32,
  x2: f32,
  y1: f32,
  y2: f32,
})

type Cosh2BSVarParams = Infer<typeof Cosh2BSVarParams>

const Cosh2BSVarParamsDefaults: Cosh2BSVarParams = {
  x1: 1.0,
  x2: 1.0,
  y1: 1.0,
  y2: 1.0,
}

const Cosh2BSVarParamsEditor: EditorFor<Cosh2BSVarParams> = (props) => (
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

export const cosh2_bsVar = parametricVariation(
  'cosh2_bsVar',
  Cosh2BSVarParams,
  Cosh2BSVarParamsDefaults,
  Cosh2BSVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const coshsin = sin(pos.y * P.y1)
    const coshcos = cos(pos.y * P.y2)
    const coshsinh = sinh(pos.x * P.x1)
    const coshcosh = cosh(pos.x * P.x2)
    return vec2f(coshcosh * coshcos, coshsinh * coshsin).mul(varInfo.weight)
  },
  'general',
)
