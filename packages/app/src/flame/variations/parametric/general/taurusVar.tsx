import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const TaurusVarParams = struct({
  r: f32,
  n: f32,
  inv: f32,
  sor: f32,
})

type TaurusVarParams = Infer<typeof TaurusVarParams>

const TaurusVarParamsDefaults: TaurusVarParams = {
  r: 3.0,
  n: 5.0,
  inv: 1.5,
  sor: 1.0,
}

const TaurusVarParamsEditor: EditorFor<TaurusVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'r', 'R', props.dataParameterPath)}
      min={0.01}
      max={20.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'n', 'N', props.dataParameterPath)}
      min={0.1}
      max={20.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'inv', 'Inv', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'sor', 'Sor', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const taurusVar = parametricVariation(
  'taurusVar',
  TaurusVarParams,
  TaurusVarParamsDefaults,
  TaurusVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const sx = sin(pos.x)
    const cx = cos(pos.x)
    const sy = sin(pos.y * P.sor)
    const ir = P.inv * P.r + (1.0 - P.inv) * P.r * cos(P.n * pos.x)

    return vec2f(cx * (ir + sy), sx * (ir + sy)).mul(varInfo.weight)
  },
  'general',
)
