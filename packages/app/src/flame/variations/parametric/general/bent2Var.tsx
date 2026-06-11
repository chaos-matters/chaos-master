import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Bent2VarParams = struct({
  factorX: f32,
  factorY: f32,
})

type Bent2VarParams = Infer<typeof Bent2VarParams>

const Bent2VarParamsDefaults: Bent2VarParams = {
  factorX: 1.0,
  factorY: 1.0,
}

const Bent2VarParamsEditor: EditorFor<Bent2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'factorX', 'Factor X', props.dataParameterPath)}
      min={0.1}
      max={5.0}
      step={0.1}
    />
    <RangeEditor
      {...editorProps(props, 'factorY', 'Factor Y', props.dataParameterPath)}
      min={0.1}
      max={5.0}
      step={0.1}
    />
  </>
)

export const bent2Var = parametricVariation(
  'bent2Var',
  Bent2VarParams,
  Bent2VarParamsDefaults,
  Bent2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    let nx = pos.x
    let ny = pos.y
    if (nx < 0.0) {
      nx = nx * P.factorX
    }
    if (ny < 0.0) {
      ny = ny * P.factorY
    }
    return vec2f(nx, ny).mul(varInfo.weight)
  },
  'general',
)
