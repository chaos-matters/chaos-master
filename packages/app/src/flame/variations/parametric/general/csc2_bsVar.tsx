import { f32, struct, vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Csc2BSVarParams = struct({
  x1: f32,
  x2: f32,
  y1: f32,
  y2: f32,
})

type Csc2BSVarParams = Infer<typeof Csc2BSVarParams>

const Csc2BSVarParamsDefaults: Csc2BSVarParams = {
  x1: 1.0,
  x2: 1.0,
  y1: 1.0,
  y2: 1.0,
}

const Csc2BSVarParamsEditor: EditorFor<Csc2BSVarParams> = (props) => (
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

export const csc2_bsVar = parametricVariation(
  'csc2_bsVar',
  Csc2BSVarParams,
  Csc2BSVarParamsDefaults,
  Csc2BSVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const cscsin = sin(pos.x * P.x1)
    const csccos = cos(pos.x * P.x2)
    const cscsinh = sinh(pos.y * P.y1)
    const csccosh = cosh(pos.y * P.y2)
    const d = cosh(2.0 * pos.y) - cos(2.0 * pos.x)
    const cscden = 2.0 / d
    return vec2f(cscden * cscsin * csccosh, -cscden * csccos * cscsinh).mul(
      varInfo.weight,
    )
  },
  'general',
)
