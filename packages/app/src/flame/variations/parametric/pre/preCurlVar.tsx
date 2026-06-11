import { f32, struct, vec2f } from 'typegpu/data'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

const PreCurlVarParams = struct({
  c1: f32,
  c2: f32,
})

type PreCurlVarParams = Infer<typeof PreCurlVarParams>

const PreCurlVarParamsDefaults: PreCurlVarParams = {
  c1: 0.0,
  c2: 0.0,
}

const PreCurlVarParamsEditor: EditorFor<PreCurlVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'c1', 'C1', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'c2', 'C2', props.dataParameterPath)}
      min={-5}
      max={5}
      step={0.01}
    />
  </>
)

export const preCurlVar = parametricVariation(
  'preCurlVar',
  PreCurlVarParams,
  PreCurlVarParamsDefaults,
  PreCurlVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const x = pos.x
    const y = pos.y
    const re = 1.0 + P.c1 * x + P.c2 * (x * x - y * y)
    const im = P.c1 * y + 2.0 * P.c2 * x * y
    const r = 1.0 / (re * re + im * im)
    return vec2f((x * re + y * im) * r, (y * re - x * im) * r).mul(
      varInfo.weight,
    )
  },
  'pre',
)
