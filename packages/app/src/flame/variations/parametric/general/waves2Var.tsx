import { f32, struct, vec2f } from 'typegpu/data'
import { sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const Waves2VarParams = struct({
  scaleX: f32,
  scaleY: f32,
  freqX: f32,
  freqY: f32,
})

type Waves2VarParams = Infer<typeof Waves2VarParams>

const Waves2VarParamsDefaults: Waves2VarParams = {
  scaleX: 0.25,
  scaleY: 0.5,
  freqX: 1.5707963,
  freqY: 0.7853982,
}

const Waves2VarParamsEditor: EditorFor<Waves2VarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scaleX', 'Scale X', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'scaleY', 'Scale Y', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'freqX', 'Freq X', props.dataParameterPath)}
      min={0}
      max={10}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'freqY', 'Freq Y', props.dataParameterPath)}
      min={0}
      max={10}
      step={0.01}
    />
  </>
)

export const waves2Var = parametricVariation(
  'waves2Var',
  Waves2VarParams,
  Waves2VarParamsDefaults,
  Waves2VarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    return vec2f(
      pos.x + P.scaleX * sin(pos.y * P.freqX),
      pos.y + P.scaleY * sin(pos.x * P.freqY),
    ).mul(varInfo.weight)
  },
  'general',
)
