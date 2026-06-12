import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, cos, length, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '../../../constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const FDiscVarParams = struct({
  ashift: f32,
  rshift: f32,
  xshift: f32,
  yshift: f32,
  term1: f32,
  term2: f32,
  term3: f32,
  term4: f32,
})

type FDiscVarParams = Infer<typeof FDiscVarParams>

const FDiscVarParamsDefaults: FDiscVarParams = {
  ashift: 1.0,
  rshift: 1.0,
  xshift: 0.0,
  yshift: 0.0,
  term1: 1.0,
  term2: 0.0,
  term3: 0.0,
  term4: 0.0,
}

const FDiscVarParamsEditor: EditorFor<FDiscVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'ashift', 'A Shift', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'rshift', 'R Shift', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'xshift', 'X Shift', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'yshift', 'Y Shift', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'term1', 'Term 1', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'term2', 'Term 2', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'term3', 'Term 3', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'term4', 'Term 4', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const fdiscVar = parametricVariation(
  'fdiscVar',
  FDiscVarParams,
  FDiscVarParamsDefaults,
  FDiscVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const afactor = (2.0 * PI.$) / (length(pos) + P.ashift)
    const r = (atan2(pos.y, pos.x) / PI.$ + P.rshift) * 0.5
    const xfactor = cos(afactor + P.xshift)
    const yfactor = sin(afactor + P.yshift)
    const prx = r * xfactor
    const pry = r * yfactor
    return vec2f(
      P.term1 * prx +
        P.term2 * pos.x * prx +
        P.term3 * pos.x * r +
        P.term4 * pos.x,
      P.term1 * pry +
        P.term2 * pos.y * pry +
        P.term3 * pos.y * r +
        P.term4 * pos.y,
    ).mul(varInfo.weight)
  },
  'general',
)
