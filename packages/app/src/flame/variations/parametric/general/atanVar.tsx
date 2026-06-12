import { f32, struct, vec2f } from 'typegpu/data'
import { atan } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { PI } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const AtanVarParams = struct({
  mode: f32,
  stretch: f32,
})

type AtanVarParams = Infer<typeof AtanVarParams>

const AtanVarParamsDefaults: AtanVarParams = {
  mode: 0,
  stretch: 1.0,
}

const AtanVarParamsEditor: EditorFor<AtanVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'mode', 'Mode', props.dataParameterPath)}
      min={0}
      max={2}
      step={1}
    />
    <RangeEditor
      {...editorProps(props, 'stretch', 'Stretch', props.dataParameterPath)}
      min={0.01}
      max={10.0}
      step={0.01}
    />
  </>
)

export const atanVar = parametricVariation(
  'atanVar',
  AtanVarParams,
  AtanVarParamsDefaults,
  AtanVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const norm = 2.0 / PI.$

    if (P.mode < 0.5) {
      return vec2f(pos.x, norm * atan(P.stretch * pos.y)).mul(varInfo.weight)
    } else if (P.mode < 1.5) {
      return vec2f(norm * atan(P.stretch * pos.x), pos.y).mul(varInfo.weight)
    }
    return vec2f(
      norm * atan(P.stretch * pos.x),
      norm * atan(P.stretch * pos.y),
    ).mul(varInfo.weight)
  },
  'general',
)
