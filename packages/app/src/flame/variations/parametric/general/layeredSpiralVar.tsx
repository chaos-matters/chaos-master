import { f32, struct, vec2f } from 'typegpu/data'
import { cos, sin } from 'typegpu/std'
import { RangeEditor } from '@/components/Sliders/ParametricEditors/RangeEditor'
import { editorProps } from '@/components/Sliders/ParametricEditors/types'
import { EPS } from '@/flame/constants'
import { parametricVariation } from '../types'
import type { Infer } from 'typegpu/data'
import type { EditorFor } from '@/components/Sliders/ParametricEditors/types'

type LayeredSpiralVarParams = Infer<typeof LayeredSpiralVarParams>
const LayeredSpiralVarParams = struct({
  radius: f32,
})

const LayeredSpiralVarParamsDefaults: LayeredSpiralVarParams = {
  radius: 1.0,
}

const LayeredSpiralVarParamsEditor: EditorFor<LayeredSpiralVarParams> = (
  props,
) => (
  <RangeEditor
    {...editorProps(props, 'radius', 'Radius')}
    min={0.1}
    max={3.0}
    step={0.01}
  />
)

export const layeredSpiralVar = parametricVariation(
  'layeredSpiralVar',
  LayeredSpiralVarParams,
  LayeredSpiralVarParamsDefaults,
  LayeredSpiralVarParamsEditor,
  (pos, varInfo, P) => {
    'use gpu'
    const a = pos.x * P.radius
    const t = pos.x * pos.x + pos.y * pos.y + EPS.$
    return vec2f(
      pos.x + varInfo.weight * a * cos(t),
      pos.y + varInfo.weight * a * sin(t),
    )
  },
  'general',
)
