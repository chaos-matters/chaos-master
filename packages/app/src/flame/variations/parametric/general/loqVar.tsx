import { f32, struct, vec2f } from 'typegpu/data'
import { atan2, log, select, sqrt } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type LoqParams = Infer<typeof LoqParams>
const LoqParams = struct({
  base: f32,
})

const LoqParamsDefaults: LoqParams = {
  base: 2.718281828,
}

const LoqParamsEditor: EditorFor<LoqParams> = (props) => (
  <>
    <RangeEditor
      {...editorProps(props, 'base', 'Base', props.dataParameterPath)}
      min={0.1}
      max={10}
      step={0.01}
    />
  </>
)

export const loqVar = parametricVariation(
  'loqVar',
  LoqParams,
  LoqParamsDefaults,
  LoqParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'

    const z = f32(0.0)
    const abs_v = sqrt(pos.y * pos.y + z * z)
    const denom = 0.5 / log(P.base)
    const C = atan2(abs_v, pos.x) / select(abs_v, 1.0e-9, abs_v === 0.0)

    const newX = log(pos.x * pos.x + abs_v * abs_v) * denom
    const newY = C * pos.y

    return vec2f(newX, newY).mul(varInfo.weight)
  },
  'general',
)
