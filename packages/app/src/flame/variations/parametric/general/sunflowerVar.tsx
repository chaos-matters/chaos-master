import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type SunflowerVarParams = Infer<typeof SunflowerVarParams>
const SunflowerVarParams = struct({
  scale: f32,
  n: f32,
})

const SunflowerVarParamsDefaults: SunflowerVarParams = {
  scale: 0.5,
  n: 200,
}

const SunflowerVarParamsEditor: EditorFor<SunflowerVarParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'scale', 'Scale')}
      min={0.1}
      max={2.0}
      step={0.01}
    />
    <RangeEditor
      {...editorProps(props, 'n', 'N')}
      min={50}
      max={500}
      step={1}
    />
  </>
)

const GOLDEN_ANGLE = 2.399963229728653

export const sunflowerVar = parametricVariation(
  'sunflowerVar',
  SunflowerVarParams,
  SunflowerVarParamsDefaults,
  SunflowerVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const idx = P.n * (sqrt(pos.x * pos.x + pos.y * pos.y) + 1.0) * 0.5
    const theta = idx * GOLDEN_ANGLE
    const r = P.scale * sqrt(idx / P.n)
    return vec2f(r * cos(theta), r * sin(theta)).mul(varInfo.weight)
  },
  'general',
)
