import { f32, struct, vec2f } from 'typegpu/data'
import { exp, max } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const CurveVarParams = struct({
  xamp: f32,
  yamp: f32,
  xlength: f32,
  ylength: f32,
})

type CurveVarParams = Infer<typeof CurveVarParams>

const CurveVarParamsDefaults: CurveVarParams = {
  xamp: 0.25,
  yamp: 0.5,
  xlength: 1.0,
  ylength: 1.0,
}

const CurveVarParamsEditor: EditorFor<CurveVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'xamp', 'X Amp', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'yamp', 'Y Amp', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xlength', 'X Length', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'ylength', 'Y Length', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
  </>
)

export const curveVar = parametricVariation(
  'curveVar',
  CurveVarParams,
  CurveVarParamsDefaults,
  CurveVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const xlen2 = max(P.xlength * P.xlength, EPS.$)
    const ylen2 = max(P.ylength * P.ylength, EPS.$)
    return vec2f(
      pos.x + P.xamp * exp((-pos.y * pos.y) / xlen2),
      pos.y + P.yamp * exp((-pos.x * pos.x) / ylen2),
    ).mul(varInfo.weight)
  },
  'general',
)
