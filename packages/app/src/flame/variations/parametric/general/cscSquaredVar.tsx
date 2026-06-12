import { f32, struct, vec2f } from 'typegpu/data'
import { cos, pow, tan } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CscSquaredVarParams = struct({
  csc_div: f32,
  cos_div: f32,
  tan_div: f32,
  csc_pow: f32,
  pi_mult: f32,
  csc_add: f32,
  scale_y: f32,
})

type CscSquaredVarParams = Infer<typeof CscSquaredVarParams>

const CscSquaredVarParamsDefaults: CscSquaredVarParams = {
  csc_div: 1.0,
  cos_div: 1.0,
  tan_div: 1.0,
  csc_pow: 0.5,
  pi_mult: 0.5,
  csc_add: 0.25,
  scale_y: 1.0,
}

const CscSquaredVarParamsEditor: EditorFor<CscSquaredVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'csc_div', 'Csc Div', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'cos_div', 'Cos Div', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'tan_div', 'Tan Div', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'csc_pow', 'Csc Pow', props.dataParameterPath)}
      min={0.01}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'pi_mult', 'Pi Mult', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'csc_add', 'Csc Add', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scale_y', 'Scale Y', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const cscSquaredVar = parametricVariation(
  'cscSquaredVar',
  CscSquaredVarParams,
  CscSquaredVarParamsDefaults,
  CscSquaredVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const csc = P.csc_div / cos(pos.x / P.cos_div) / tan(pos.x / P.tan_div)
    const fx = pow(csc * csc + PI.$ * P.pi_mult, P.csc_pow) + P.csc_add
    return vec2f(pos.x * fx, pos.y * fx * P.scale_y).mul(varInfo.weight)
  },
  'general',
)
