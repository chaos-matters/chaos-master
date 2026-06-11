import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const HypershiftVarParams = struct({
  shift: f32,
  stretch: f32,
})

type HypershiftVarParams = Infer<typeof HypershiftVarParams>

const HypershiftVarParamsDefaults: HypershiftVarParams = {
  shift: 2.0,
  stretch: 1.0,
}

const HypershiftVarParamsEditor: EditorFor<HypershiftVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'shift', 'Shift', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'stretch', 'Stretch', props.dataParameterPath)}
      min={-5.0}
      max={5.0}
      step={0.01}
    />
  </>
)

export const hypershiftVar = parametricVariation(
  'hypershiftVar',
  HypershiftVarParams,
  HypershiftVarParamsDefaults,
  HypershiftVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const scale = 1.0 - P.shift * P.shift
    const rad = 1.0 / (pos.x * pos.x + pos.y * pos.y + 1e-10)
    const x = rad * pos.x + P.shift
    const y = rad * pos.y
    const rad2 = scale / (x * x + y * y + 1e-10)

    return vec2f(rad2 * x + P.shift, rad2 * y * P.stretch).mul(varInfo.weight)
  },
  'general',
)
