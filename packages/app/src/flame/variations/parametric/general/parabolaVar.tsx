import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { random } from '@/shaders/random'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const ParabolaVarParams = struct({
  width: f32,
  height: f32,
})

type ParabolaVarParams = Infer<typeof ParabolaVarParams>

const ParabolaVarParamsDefaults: ParabolaVarParams = {
  width: 1.0,
  height: 0.5,
}

const ParabolaVarParamsEditor: EditorFor<ParabolaVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'width', 'Width', props.dataParameterPath)}
      min={0}
      max={3}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'height', 'Height', props.dataParameterPath)}
      min={0}
      max={3}
      step={0.01}
    />
  </>
)

export const parabolaVar = parametricVariation(
  'parabolaVar',
  ParabolaVarParams,
  ParabolaVarParamsDefaults,
  ParabolaVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const r = sqrt(pos.x * pos.x + pos.y * pos.y)
    const sr = sin(r)
    const cr = cos(r)
    return vec2f(P.height * sr * sr * random(), P.width * cr * random()).mul(
      varInfo.weight,
    )
  },
  'general',
)
