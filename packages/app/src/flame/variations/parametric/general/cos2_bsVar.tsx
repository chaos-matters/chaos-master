import { f32, struct, vec2f } from 'typegpu/data'
import { cos, cosh, sin, sinh } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Cos2BSVarParams = struct({
  x1: f32,
  x2: f32,
  y1: f32,
  y2: f32,
})

type Cos2BSVarParams = Infer<typeof Cos2BSVarParams>

const Cos2BSVarParamsDefaults: Cos2BSVarParams = {
  x1: 1.0,
  x2: 1.0,
  y1: 1.0,
  y2: 1.0,
}

const Cos2BSVarParamsEditor: EditorFor<Cos2BSVarParams> = (props) => (
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

export const cos2_bsVar = parametricVariation(
  'cos2_bsVar',
  Cos2BSVarParams,
  Cos2BSVarParamsDefaults,
  Cos2BSVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const cossin = sin(pos.x * P.x1)
    const coscos = cos(pos.x * P.x2)
    const cossinh = sinh(pos.y * P.y1)
    const coscosh = cosh(pos.y * P.y2)
    return vec2f(coscos * coscosh, -cossin * cossinh).mul(varInfo.weight)
  },
  'general',
)
