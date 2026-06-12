import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const SvenssonVarParams = struct({
  a: f32,
  b: f32,
  c: f32,
  d: f32,
})

type SvenssonVarParams = Infer<typeof SvenssonVarParams>

const SvenssonVarParamsDefaults: SvenssonVarParams = {
  a: 1.4,
  b: 1.56,
  c: 1.4,
  d: -6.56,
}

const SvenssonVarParamsEditor: EditorFor<SvenssonVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'a', 'A', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'b', 'B', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c', 'C', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'd', 'D', props.dataParameterPath)}
      min={-10.0}
      max={10.0}
      step={0.01}
    />
  </>
)

export const svenssonVar = parametricVariation(
  'svenssonVar',
  SvenssonVarParams,
  SvenssonVarParamsDefaults,
  SvenssonVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = P.d * sin(P.a * pos.x) - sin(P.b * pos.y)
    const y = P.c * cos(P.a * pos.x) + cos(P.b * pos.y)
    return vec2f(x, y).mul(varInfo.weight)
  },
  'general',
)
